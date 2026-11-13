use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const DEFAULT_BUFFER_CAPACITY: usize = 150; // 150 samples * 2s = 300s (5 minutes)

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelSample {
    pub timestamp: u64, // Unix epoch ms
    pub gateway_rtt: Option<f64>, // ms
    pub anycast_rtt: Option<f64>, // ms
    pub bssid: Option<String>,
    pub ssid: Option<String>,
    pub rssi: Option<i32>,
    pub noise: Option<i32>,
    pub is_gateway_loss: bool,
    pub is_anycast_loss: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelBufferStats {
    pub sample_count: usize,
    pub capacity: usize,
    pub latest_gateway_rtt: Option<f64>,
    pub latest_anycast_rtt: Option<f64>,
    pub rolling_median_rtt_1m: Option<f64>,
    pub rolling_jitter_1m: Option<f64>,
    pub loss_rate_1m: f64,
    pub current_bssid: Option<String>,
    pub current_ssid: Option<String>,
    pub current_rssi: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct SentinelRingBuffer {
    capacity: usize,
    buffer: VecDeque<SentinelSample>,
}

impl Default for SentinelRingBuffer {
    fn default() -> Self {
        Self::new(DEFAULT_BUFFER_CAPACITY)
    }
}

impl SentinelRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: if capacity == 0 { DEFAULT_BUFFER_CAPACITY } else { capacity },
            buffer: VecDeque::with_capacity(capacity),
        }
    }

    pub fn push(&mut self, sample: SentinelSample) {
        if self.buffer.len() >= self.capacity {
            self.buffer.pop_front();
        }
        self.buffer.push_back(sample);
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
    }

    pub fn get_all(&self) -> Vec<SentinelSample> {
        self.buffer.iter().cloned().collect()
    }

    pub fn get_recent(&self, count: usize) -> Vec<SentinelSample> {
        let n = self.buffer.len();
        let skip = if n > count { n - count } else { 0 };
        self.buffer.iter().skip(skip).cloned().collect()
    }

    pub fn latest(&self) -> Option<&SentinelSample> {
        self.buffer.back()
    }

    /// Calculate rolling median gateway RTT over the last N samples (default 30 samples = ~1 min)
    pub fn rolling_median_gateway_rtt(&self, count: usize) -> Option<f64> {
        let recent = self.get_recent(count);
        let mut rtts: Vec<f64> = recent.into_iter().filter_map(|s| s.gateway_rtt).collect();
        if rtts.is_empty() {
            return None;
        }
        rtts.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mid = rtts.len() / 2;
        if rtts.len() % 2 == 0 {
            Some(((rtts[mid - 1] + rtts[mid]) / 2.0 * 10.0).round() / 10.0)
        } else {
            Some((rtts[mid] * 10.0).round() / 10.0)
        }
    }

    /// Calculate rolling jitter (standard deviation) over the last N samples
    pub fn rolling_jitter_gateway_rtt(&self, count: usize) -> Option<f64> {
        let recent = self.get_recent(count);
        let rtts: Vec<f64> = recent.into_iter().filter_map(|s| s.gateway_rtt).collect();
        if rtts.len() < 2 {
            return None;
        }
        let sum: f64 = rtts.iter().sum();
        let mean = sum / rtts.len() as f64;
        let variance: f64 = rtts.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / rtts.len() as f64;
        Some(((variance.sqrt()) * 10.0).round() / 10.0)
    }

    /// Calculate packet loss percentage over the last N samples
    pub fn loss_rate_recent(&self, count: usize) -> f64 {
        let recent = self.get_recent(count);
        if recent.is_empty() {
            return 0.0;
        }
        let lost_count = recent.iter().filter(|s| s.is_gateway_loss || s.is_anycast_loss).count();
        ((lost_count as f64 / recent.len() as f64) * 1000.0).round() / 10.0
    }

    /// Returns a summary snapshot of buffer statistics
    pub fn compute_stats(&self) -> SentinelBufferStats {
        let latest = self.latest();
        SentinelBufferStats {
            sample_count: self.len(),
            capacity: self.capacity,
            latest_gateway_rtt: latest.and_then(|s| s.gateway_rtt),
            latest_anycast_rtt: latest.and_then(|s| s.anycast_rtt),
            rolling_median_rtt_1m: self.rolling_median_gateway_rtt(30),
            rolling_jitter_1m: self.rolling_jitter_gateway_rtt(30),
            loss_rate_1m: self.loss_rate_recent(30),
            current_bssid: latest.and_then(|s| s.bssid.clone()),
            current_ssid: latest.and_then(|s| s.ssid.clone()),
            current_rssi: latest.and_then(|s| s.rssi),
        }
    }
}
