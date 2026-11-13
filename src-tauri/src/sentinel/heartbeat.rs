use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter};

use super::anomaly_detector::{AnomalyDetector, IncidentReport};
use super::ring_buffer::{SentinelBufferStats, SentinelRingBuffer, SentinelSample};
use crate::probes::interface_resolver::InterfaceResolver;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelStatusInfo {
    pub is_running: bool,
    pub title: String,
    pub stats: SentinelBufferStats,
    pub remaining_cooldown_sec: u64,
}

pub struct SentinelState {
    pub ring_buffer: Arc<RwLock<SentinelRingBuffer>>,
    pub detector: Arc<Mutex<AnomalyDetector>>,
    pub is_enabled: Arc<AtomicBool>,
    pub last_status_title: Arc<RwLock<String>>,
    pub cached_physical_iface: Arc<RwLock<Option<String>>>,
    pub cached_gateway_ip: Arc<RwLock<Option<String>>>,
}

impl Default for SentinelState {
    fn default() -> Self {
        Self {
            ring_buffer: Arc::new(RwLock::new(SentinelRingBuffer::default())),
            detector: Arc::new(Mutex::new(AnomalyDetector::default())),
            is_enabled: Arc::new(AtomicBool::new(true)),
            last_status_title: Arc::new(RwLock::new("🟢 哨兵准备就绪".to_string())),
            cached_physical_iface: Arc::new(RwLock::new(None)),
            cached_gateway_ip: Arc::new(RwLock::new(None)),
        }
    }
}

pub struct HeartbeatRunner;

impl HeartbeatRunner {
    pub fn start(app: AppHandle, state: Arc<SentinelState>) {
        tauri::async_runtime::spawn(async move {
            let mut tick_counter: u64 = 0;

            loop {
                tokio::time::sleep(Duration::from_millis(2000)).await;

                if !state.is_enabled.load(Ordering::SeqCst) {
                    continue;
                }

                tick_counter += 1;

                // Resolve physical iface and gateway every 30 ticks (~60s) or if empty
                if tick_counter % 30 == 1 || state.cached_gateway_ip.read().await.is_none() {
                    let topo = tauri::async_runtime::spawn_blocking(|| {
                        InterfaceResolver::resolve_topology(true)
                    }).await.unwrap_or_default();

                    let iface = topo.physical_interface.unwrap_or_else(|| "en0".to_string());
                    let gw = topo.physical_gateway.unwrap_or_else(|| "192.168.1.1".to_string());

                    *state.cached_physical_iface.write().await = Some(iface);
                    *state.cached_gateway_ip.write().await = Some(gw);
                }

                let phys_iface = state.cached_physical_iface.read().await.clone().unwrap_or_else(|| "en0".to_string());
                let gw_ip = state.cached_gateway_ip.read().await.clone().unwrap_or_else(|| "192.168.1.1".to_string());

                // Execute lightweight probes in blocking task
                let iface_clone = phys_iface.clone();
                let gw_clone = gw_ip.clone();

                let probe_result = tauri::async_runtime::spawn_blocking(move || {
                    Self::perform_single_probe(&iface_clone, &gw_clone)
                }).await.unwrap_or_else(|_| (None, None, None, None, None, None, true, true));

                let (gw_rtt, anycast_rtt, bssid, ssid, rssi, noise, gw_loss, anycast_loss) = probe_result;

                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let sample = SentinelSample {
                    timestamp: now_ms,
                    gateway_rtt: gw_rtt,
                    anycast_rtt,
                    bssid,
                    ssid,
                    rssi,
                    noise,
                    is_gateway_loss: gw_loss,
                    is_anycast_loss: anycast_loss,
                };

                // Push to ring buffer
                {
                    let mut buf = state.ring_buffer.write().await;
                    buf.push(sample);
                }

                // Compute stats
                let stats = {
                    let buf = state.ring_buffer.read().await;
                    buf.compute_stats()
                };

                // Generate macOS Menu Bar title
                let status_title = Self::format_status_title(&stats);
                *state.last_status_title.write().await = status_title.clone();

                // Update Tauri Menu Bar Tray title on macOS (ensure main thread dispatch)
                let app_handle = app.clone();
                let title_clone = status_title.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(tray) = app_handle.tray_by_id("sentinel-tray") {
                        let _ = tray.set_title(Some(&title_clone));
                    }
                });

                // Evaluate Anomaly Detector
                let incident_opt = {
                    let buf = state.ring_buffer.read().await;
                    let mut det = state.detector.lock().await;
                    det.evaluate(&buf, now_ms)
                };

                if let Some(incident) = incident_opt {
                    // Send macOS native notification
                    Self::trigger_macos_notification(&incident);

                    // Emit incident to frontend
                    let _ = app.emit("sentinel-incident", &incident);
                }

                // Emit tick to frontend
                let _ = app.emit("sentinel-tick", &stats);
            }
        });
    }

    /// Performs one fast cycle of gateway ping, anycast ping, and Wi-Fi state inspection
    fn perform_single_probe(
        iface: &str,
        gw_ip: &str,
    ) -> (
        Option<f64>,
        Option<f64>,
        Option<String>,
        Option<String>,
        Option<i32>,
        Option<i32>,
        bool,
        bool,
    ) {
        // 1. Gateway Ping (bounded to physical interface en0, 800ms timeout)
        let gw_output = Command::new("ping")
            .args(["-c", "1", "-W", "800", "-b", iface, gw_ip])
            .output();

        let (gw_rtt, gw_loss) = match gw_output {
            Ok(ref out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                (Self::parse_ping_time(&text), false)
            }
            _ => (None, true),
        };

        // 2. Anycast Ping (223.5.5.5 - AliCloud Anycast DNS, 800ms timeout)
        let anycast_output = Command::new("ping")
            .args(["-c", "1", "-W", "800", "223.5.5.5"])
            .output();

        let (anycast_rtt, anycast_loss) = match anycast_output {
            Ok(ref out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                (Self::parse_ping_time(&text), false)
            }
            _ => (None, true),
        };

        // 3. Fast Wi-Fi Info from ipconfig getsummary
        let (bssid, ssid) = Self::get_wifi_summary(iface);

        (
            gw_rtt,
            anycast_rtt,
            bssid,
            ssid,
            None, // Fast cycle skips heavy system_profiler RSSI to save CPU
            None,
            gw_loss,
            anycast_loss,
        )
    }

    fn parse_ping_time(output: &str) -> Option<f64> {
        let time_re = Regex::new(r"time=([0-9.]+)\s*ms").ok()?;
        if let Some(cap) = time_re.captures(output) {
            if let Ok(v) = cap[1].parse::<f64>() {
                return Some(((v * 10.0).round()) / 10.0);
            }
        }
        None
    }

    fn get_wifi_summary(iface: &str) -> (Option<String>, Option<String>) {
        let output = Command::new("ipconfig").args(["getsummary", iface]).output().ok();
        let mut bssid = None;
        let mut ssid = None;

        if let Some(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let bssid_re = Regex::new(r"BSSID\s*:\s*([0-9a-fA-F:]{11,17})").ok();
            let ssid_re = Regex::new(r"SSID\s*:\s*(.+)$").ok();

            for line in text.lines() {
                let line_str = line.trim();
                if let Some(ref re) = bssid_re {
                    if let Some(cap) = re.captures(line_str) {
                        bssid = Some(cap[1].trim().to_string());
                    }
                }
                if let Some(ref re) = ssid_re {
                    if let Some(cap) = re.captures(line_str) {
                        let name = cap[1].trim();
                        if !name.is_empty() && name != "<redacted>" {
                            ssid = Some(name.to_string());
                        }
                    }
                }
            }
        }

        (bssid, ssid)
    }

    /// Format title for macOS top Menu Bar (compact, monospace-ready)
    fn format_status_title(stats: &SentinelBufferStats) -> String {
        let loss = stats.loss_rate_1m;
        let rtt = stats.latest_gateway_rtt.or(stats.rolling_median_rtt_1m);
        let jitter = stats.rolling_jitter_1m.unwrap_or(0.0);

        if loss >= 50.0 {
            "🔴 Offline".to_string()
        } else if loss > 5.0 {
            format!("🔴 Loss {:.0}%", loss)
        } else if let Some(rtt_val) = rtt {
            if rtt_val > 100.0 || jitter > 25.0 {
                format!("🟡 {:.0}ms · Jitter {:.0}ms", rtt_val, jitter)
            } else {
                format!("🟢 {:.0}ms · 0%", rtt_val)
            }
        } else {
            "🟡 探测中...".to_string()
        }
    }

    fn trigger_macos_notification(incident: &IncidentReport) {
        let title = "NetPath-Lens Pro 哨兵告警";
        let subtitle = incident.trigger_reason.display_title();
        let message = &incident.trigger_description;

        let script = format!(
            "display notification \"{}\" with title \"{}\" subtitle \"{}\" sound name \"Ping\"",
            message.replace('"', "\\\""),
            title,
            subtitle
        );

        let _ = Command::new("osascript").args(["-e", &script]).spawn();
    }
}
