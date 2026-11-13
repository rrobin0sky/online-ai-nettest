use super::ring_buffer::{SentinelRingBuffer, SentinelSample};
use serde::{Deserialize, Serialize};

pub const COOLDOWN_DURATION_MS: u64 = 180_000; // 3 minutes cooldown
pub const LATENCY_SPIKE_THRESHOLD_MS: f64 = 150.0; // +150ms jump over 1m rolling median
pub const SLIDING_WINDOW_SAMPLES: usize = 30; // 30 samples * 2s = 60s

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnomalyTriggerReason {
    #[serde(rename = "AP_ROAMING_FLAP")]
    ApRoamingFlap,
    #[serde(rename = "LATENCY_SPIKE")]
    LatencySpike,
    #[serde(rename = "BURST_LOSS")]
    BurstLoss,
}

impl AnomalyTriggerReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ApRoamingFlap => "AP_ROAMING_FLAP",
            Self::LatencySpike => "LATENCY_SPIKE",
            Self::BurstLoss => "BURST_LOSS",
        }
    }

    pub fn display_title(&self) -> &'static str {
        match self {
            Self::ApRoamingFlap => "Wi-Fi AP 漫游颠簸 (Roaming Flap)",
            Self::LatencySpike => "突发高延迟尖刺 (Latency Spike > +150ms)",
            Self::BurstLoss => "突发连续丢包 (Burst Packet Loss)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentReport {
    pub id: String,
    pub timestamp: u64,
    pub trigger_reason: AnomalyTriggerReason,
    pub trigger_description: String,
    pub metrics_at_trigger: IncidentMetricsSnapshot,
    pub frozen_samples: Vec<SentinelSample>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncidentMetricsSnapshot {
    pub gateway_rtt: Option<f64>,
    pub anycast_rtt: Option<f64>,
    pub rolling_median_rtt: Option<f64>,
    pub rolling_jitter: Option<f64>,
    pub loss_rate_pct: f64,
    pub bssid: Option<String>,
    pub ssid: Option<String>,
    pub rssi: Option<i32>,
    pub distinct_bssids_last_60s: Vec<String>,
}

#[derive(Debug)]
pub struct AnomalyDetector {
    last_trigger_timestamp: u64,
    cooldown_ms: u64,
}

impl Default for AnomalyDetector {
    fn default() -> Self {
        Self::new(COOLDOWN_DURATION_MS)
    }
}

impl AnomalyDetector {
    pub fn new(cooldown_ms: u64) -> Self {
        Self {
            last_trigger_timestamp: 0,
            cooldown_ms,
        }
    }

    pub fn remaining_cooldown_ms(&self, current_time_ms: u64) -> u64 {
        if self.last_trigger_timestamp == 0 {
            return 0;
        }
        let elapsed = current_time_ms.saturating_sub(self.last_trigger_timestamp);
        if elapsed < self.cooldown_ms {
            self.cooldown_ms - elapsed
        } else {
            0
        }
    }

    pub fn is_in_cooldown(&self, current_time_ms: u64) -> bool {
        self.remaining_cooldown_ms(current_time_ms) > 0
    }

    /// Evaluates ring buffer and returns an IncidentReport if an anomaly is triggered
    pub fn evaluate(
        &mut self,
        ring_buffer: &SentinelRingBuffer,
        current_time_ms: u64,
    ) -> Option<IncidentReport> {
        let latest = ring_buffer.latest()?;

        // If currently in cooldown, skip anomaly evaluation to prevent notification storms
        if self.is_in_cooldown(current_time_ms) {
            return None;
        }

        // Need at least 3 samples to evaluate
        if ring_buffer.len() < 3 {
            return None;
        }

        let mut trigger: Option<(AnomalyTriggerReason, String)> = None;

        // Check 1: Burst Packet Loss (>= 2 consecutive timeouts on gateway or anycast)
        let recent_samples = ring_buffer.get_recent(2);
        if recent_samples.len() >= 2 {
            let consecutive_gw_loss = recent_samples.iter().all(|s| s.is_gateway_loss);
            let consecutive_anycast_loss = recent_samples.iter().all(|s| s.is_anycast_loss);
            if consecutive_gw_loss || consecutive_anycast_loss {
                let target = if consecutive_gw_loss { "本地网关" } else { "Anycast公共出口" };
                trigger = Some((
                    AnomalyTriggerReason::BurstLoss,
                    format!("检测到连续2次探测丢包超时 (目标: {})", target),
                ));
            }
        }

        // Check 2: Wi-Fi BSSID Roaming Flapping (>= 2 distinct BSSIDs in the last 60s)
        if trigger.is_none() {
            let sliding_window = ring_buffer.get_recent(SLIDING_WINDOW_SAMPLES);
            let mut distinct_bssids: Vec<String> = Vec::new();
            for s in &sliding_window {
                if let Some(ref b) = s.bssid {
                    let trimmed = b.trim();
                    if !trimmed.is_empty() && !distinct_bssids.contains(&trimmed.to_string()) {
                        distinct_bssids.push(trimmed.to_string());
                    }
                }
            }

            if distinct_bssids.len() >= 2 {
                trigger = Some((
                    AnomalyTriggerReason::ApRoamingFlap,
                    format!(
                        "检测到60秒内发生AP漫游漂移 (观察到{}个不同BSSID: {})",
                        distinct_bssids.len(),
                        distinct_bssids.join(", ")
                    ),
                ));
            }
        }

        // Check 3: Latency Spike (> +150ms jump over 1-minute rolling median)
        if trigger.is_none() {
            if let Some(current_rtt) = latest.gateway_rtt {
                if let Some(median_rtt) = ring_buffer.rolling_median_gateway_rtt(SLIDING_WINDOW_SAMPLES) {
                    if current_rtt > median_rtt + LATENCY_SPIKE_THRESHOLD_MS {
                        trigger = Some((
                            AnomalyTriggerReason::LatencySpike,
                            format!(
                                "网关延迟突增尖刺: 当前 {:.1}ms (基线中位数 {:.1}ms, 增幅 +{:.1}ms > 150ms)",
                                current_rtt,
                                median_rtt,
                                current_rtt - median_rtt
                            ),
                        ));
                    }
                }
            }
        }

        if let Some((reason, desc)) = trigger {
            // Trigger incident
            self.last_trigger_timestamp = current_time_ms;

            let sliding_window = ring_buffer.get_recent(SLIDING_WINDOW_SAMPLES);
            let mut distinct_bssids: Vec<String> = Vec::new();
            for s in &sliding_window {
                if let Some(ref b) = s.bssid {
                    let trimmed = b.trim();
                    if !trimmed.is_empty() && !distinct_bssids.contains(&trimmed.to_string()) {
                        distinct_bssids.push(trimmed.to_string());
                    }
                }
            }

            let incident = IncidentReport {
                id: format!("inc_{}_{}", current_time_ms, reason.as_str()),
                timestamp: current_time_ms,
                trigger_reason: reason,
                trigger_description: desc,
                metrics_at_trigger: IncidentMetricsSnapshot {
                    gateway_rtt: latest.gateway_rtt,
                    anycast_rtt: latest.anycast_rtt,
                    rolling_median_rtt: ring_buffer.rolling_median_gateway_rtt(SLIDING_WINDOW_SAMPLES),
                    rolling_jitter: ring_buffer.rolling_jitter_gateway_rtt(SLIDING_WINDOW_SAMPLES),
                    loss_rate_pct: ring_buffer.loss_rate_recent(SLIDING_WINDOW_SAMPLES),
                    bssid: latest.bssid.clone(),
                    ssid: latest.ssid.clone(),
                    rssi: latest.rssi,
                    distinct_bssids_last_60s: distinct_bssids,
                },
                frozen_samples: sliding_window,
            };

            Some(incident)
        } else {
            None
        }
    }
}
