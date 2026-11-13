use std::process::Command;
use regex::Regex;
use serde_json::Value;

use crate::models::{SignalQualityRating, WiFiInterfaceInfo};

pub struct Stage1Probe;

impl Stage1Probe {
    /// Executes the complete Stage 1 Local Link & Gateway Telemetry Probe
    pub async fn run(bypass_tunnel: Option<bool>) -> Result<WiFiInterfaceInfo, String> {
        let bypass = bypass_tunnel.unwrap_or(true);
        // Execute blocking CLI commands in tokio spawn_blocking
        tokio::task::spawn_blocking(move || Self::collect_stage1_sync(bypass))
            .await
            .map_err(|e| format!("Task execution error: {}", e))?
    }

    pub fn collect_stage1_sync(bypass_tunnel: bool) -> Result<WiFiInterfaceInfo, String> {
        // 1. Resolve network interface topology (Virtual TUN/VPN vs Physical en0/enX)
        let topo = crate::probes::interface_resolver::InterfaceResolver::resolve_topology(bypass_tunnel);

        // Determine effective interface and gateway for probing
        let (effective_iface, effective_gw, bound_iface) = if topo.is_physical_bypass_active {
            (
                topo.physical_interface.clone().unwrap_or_else(|| "en0".to_string()),
                topo.physical_gateway.clone().unwrap_or_else(|| "192.168.1.1".to_string()),
                topo.physical_interface.as_deref(),
            )
        } else if topo.is_tunnel_active && !bypass_tunnel {
            (
                topo.tunnel_interface.clone().unwrap_or_else(|| "utun4".to_string()),
                topo.tunnel_gateway.clone().unwrap_or_else(|| "198.18.0.1".to_string()),
                None,
            )
        } else {
            let (def_if, def_gw) = Self::get_default_route_info()
                .unwrap_or_else(|| ("en0".to_string(), "192.168.1.1".to_string()));
            (def_if, def_gw, None)
        };

        // Query physical hardware info using physical device if available so Wi-Fi info isn't lost
        let rf_iface = topo.physical_interface.as_deref().unwrap_or(&effective_iface);

        // 2. Hardware port & MAC mapping via networksetup
        let (port_type, hw_mac) = Self::get_hardware_port_info(rf_iface);

        // 3. Interface IPv4/DHCP info via ipconfig
        let ipconfig_info = Self::get_ipconfig_summary(rf_iface);

        // Effective IP, Netmask, BSSID, SSID
        let ip_address = topo.physical_ip.clone().or_else(|| {
            ipconfig_info.ip_address.or_else(|| Self::get_ifconfig_ip(rf_iface))
        });
        let subnet_mask = ipconfig_info.subnet_mask;
        let bssid = ipconfig_info.bssid;
        let ssid = ipconfig_info.ssid;
        let link_status_active = ipconfig_info.link_status_active;

        // 4. Wi-Fi Physical Layer (L1/L2) Telemetry via system_profiler
        let wifi_rf = Self::get_wifi_profiler_rf(rf_iface);

        // Use Wi-Fi profiler SSID if ipconfig didn't catch it
        let effective_ssid = ssid.or(wifi_rf.ssid);

        // 5. Gateway MAC resolution via ARP
        let gateway_mac = Self::get_gateway_mac(&effective_gw);

        // 6. 10 continuous ICMP pings (50ms interval) to Default Gateway
        // Uses macOS ping -b <interface> when physical bypass is active
        let (rtt_samples, rtt_avg, rtt_min, rtt_max, jitter, loss_pct) =
            Self::probe_gateway_latency(&effective_gw, bound_iface);

        // 7. Evaluate Diagnostic Rules
        let mut diagnosis_flags = Vec::new();

        if topo.is_tunnel_active {
            if topo.is_physical_bypass_active {
                diagnosis_flags.push(format!(
                    "[INFO: TUN/VPN Active ({}) | Physical Bypass: {} -> {}]",
                    topo.tunnel_interface.as_deref().unwrap_or("utun"),
                    topo.physical_interface.as_deref().unwrap_or("en0"),
                    effective_gw
                ));
            } else {
                diagnosis_flags.push(format!(
                    "[WARN: TUN/VPN Active ({}) - Egress Captured by Virtual Interface]",
                    topo.tunnel_interface.as_deref().unwrap_or("utun")
                ));
            }
        }

        if let Some(snr) = wifi_rf.snr_db {
            if snr < 20 {
                diagnosis_flags.push("[WARN: Wi-Fi Signal Weak / High RF Noise (SNR < 20 dB)]".to_string());
            }
        }

        if let Some(rssi) = wifi_rf.rssi_dbm {
            if rssi < -75 {
                diagnosis_flags.push("[WARN: Wi-Fi Signal Weak (RSSI < -75 dBm)]".to_string());
            }
        }

        if let Some(jit) = jitter {
            if jit > 15.0 {
                diagnosis_flags.push(format!(
                    "[CRITICAL: AP Roaming Flapping / Overloaded AP (Gateway Jitter {:.1}ms > 15ms)]",
                    jit
                ));
            }
        }

        if loss_pct > 3.0 {
            diagnosis_flags.push(format!(
                "[CRITICAL: Local Gateway Packet Loss ({:.1}% loss to default gateway)]",
                loss_pct
            ));
        }

        // Determine Signal Quality Rating
        let signal_quality = Self::calculate_signal_quality(
            wifi_rf.rssi_dbm,
            wifi_rf.snr_db,
            jitter,
            loss_pct,
            &port_type,
        );

        Ok(WiFiInterfaceInfo {
            interface_name: effective_iface,
            mac_address: hw_mac,
            interface_type: port_type,
            ip_address,
            subnet_mask,
            link_status_active,
            ssid: effective_ssid,
            bssid,
            rssi_dbm: wifi_rf.rssi_dbm,
            noise_dbm: wifi_rf.noise_dbm,
            snr_db: wifi_rf.snr_db,
            channel: wifi_rf.channel,
            channel_width_mhz: wifi_rf.channel_width_mhz,
            channel_band: wifi_rf.channel_band,
            phy_mode: wifi_rf.phy_mode,
            standard_generation: wifi_rf.standard_generation,
            tx_rate_mbps: wifi_rf.tx_rate_mbps,
            mcs_index: wifi_rf.mcs_index,
            gateway_ip: Some(effective_gw),
            gateway_mac,
            gateway_rtt_samples: rtt_samples,
            gateway_rtt_avg_ms: rtt_avg,
            gateway_rtt_min_ms: rtt_min,
            gateway_rtt_max_ms: rtt_max,
            gateway_jitter_ms: jitter,
            gateway_packet_loss_pct: loss_pct,
            signal_quality,
            diagnosis_flags,
            is_tunnel_active: topo.is_tunnel_active,
            tunnel_interface: topo.tunnel_interface,
            tunnel_gateway: topo.tunnel_gateway,
            physical_interface: topo.physical_interface,
            physical_gateway: topo.physical_gateway,
            is_physical_bypass_active: topo.is_physical_bypass_active,
        })
    }

    /// Query route get default to discover active interface and default gateway
    fn get_default_route_info() -> Option<(String, String)> {
        let output = Command::new("route")
            .args(["-n", "get", "default"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let mut gateway = None;
        let mut interface = None;

        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("gateway:") {
                gateway = line.split_whitespace().nth(1).map(|s| s.to_string());
            } else if line.starts_with("interface:") {
                interface = line.split_whitespace().nth(1).map(|s| s.to_string());
            }
        }

        match (interface, gateway) {
            (Some(i), Some(g)) => Some((i, g)),
            _ => None,
        }
    }

    /// Query networksetup -listallhardwareports to identify hardware port type and MAC address
    fn get_hardware_port_info(iface: &str) -> (String, String) {
        let output = Command::new("networksetup")
            .arg("-listallhardwareports")
            .output();

        let mut port_type = "Wi-Fi".to_string();
        let mut mac = "00:00:00:00:00:00".to_string();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut current_port = String::new();
            let mut current_device = String::new();

            for line in text.lines() {
                let line = line.trim();
                if line.starts_with("Hardware Port:") {
                    current_port = line.replace("Hardware Port:", "").trim().to_string();
                } else if line.starts_with("Device:") {
                    current_device = line.replace("Device:", "").trim().to_string();
                } else if line.starts_with("Ethernet Address:") {
                    let parsed_mac = line.replace("Ethernet Address:", "").trim().to_string();
                    if current_device == iface {
                        port_type = current_port.clone();
                        mac = parsed_mac;
                        break;
                    }
                }
            }
        }

        (port_type, mac)
    }

    /// Query ipconfig getsummary <iface> for DHCP router, SSID, BSSID, and addresses
    fn get_ipconfig_summary(iface: &str) -> IpconfigSummary {
        let mut summary = IpconfigSummary::default();
        let output = Command::new("ipconfig")
            .args(["getsummary", iface])
            .output();

        let Ok(out) = output else {
            return summary;
        };

        let text = String::from_utf8_lossy(&out.stdout);

        for line in text.lines() {
            let line = line.trim();
            if let Some(pos) = line.find(':') {
                let key = line[..pos].trim();
                let val = line[pos + 1..].trim();

                if key == "BSSID" && !val.is_empty() {
                    let normalized: Vec<String> = val
                        .split(':')
                        .map(|part| if part.len() == 1 { format!("0{}", part) } else { part.to_string() })
                        .collect();
                    summary.bssid = Some(normalized.join(":"));
                } else if key == "SSID" && !val.is_empty() {
                    summary.ssid = Some(val.to_string());
                }
            }
        }

        let ip_re = Regex::new(r"Addresses\s*:\s*<array>\s*\{\s*0\s*:\s*([0-9.]+)").ok();
        let mask_re = Regex::new(r"SubnetMasks\s*:\s*<array>\s*\{\s*0\s*:\s*([0-9.]+)").ok();

        if let Some(re) = ip_re {
            if let Some(cap) = re.captures(&text) {
                summary.ip_address = Some(cap[1].to_string());
            }
        }

        if let Some(re) = mask_re {
            if let Some(cap) = re.captures(&text) {
                summary.subnet_mask = Some(cap[1].to_string());
            }
        }

        if text.contains("LinkStatusActive : TRUE") {
            summary.link_status_active = true;
        }

        summary
    }

    /// Fallback query ifconfig for IP
    fn get_ifconfig_ip(iface: &str) -> Option<String> {
        let output = Command::new("ifconfig").arg(iface).output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let inet_re = Regex::new(r"inet\s+([0-9.]+)\s+netmask").ok()?;
        inet_re.captures(&text).map(|cap| cap[1].to_string())
    }

    /// Query system_profiler -json SPAirPortDataType for full Wi-Fi RF physical metrics
    fn get_wifi_profiler_rf(iface: &str) -> WifiRfMetrics {
        let mut metrics = WifiRfMetrics::default();

        let output = Command::new("system_profiler")
            .args(["-json", "SPAirPortDataType"])
            .output();

        let Ok(out) = output else {
            return metrics;
        };

        let Ok(val) = serde_json::from_slice::<Value>(&out.stdout) else {
            return metrics;
        };

        let interfaces = val
            .get("SPAirPortDataType")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("spairport_airport_interfaces"))
            .and_then(|arr| arr.as_array());

        let Some(interfaces) = interfaces else {
            return metrics;
        };

        for item in interfaces {
            let name = item.get("_name").and_then(|n| n.as_str());
            if name == Some(iface) {
                let cur = item.get("spairport_current_network_information");
                let Some(cur) = cur else { continue };

                // SSID
                if let Some(ssid_str) = cur.get("_name").and_then(|s| s.as_str()) {
                    metrics.ssid = Some(ssid_str.to_string());
                }

                // PHY Mode
                if let Some(phy) = cur.get("spairport_network_phymode").and_then(|s| s.as_str()) {
                    metrics.phy_mode = Some(phy.to_string());
                    metrics.standard_generation = Some(Self::map_phy_to_generation(phy));
                }

                // Channel string: e.g. "6 (2GHz, 20MHz)" or "48 (5GHz, 160MHz)"
                if let Some(ch_str) = cur.get("spairport_network_channel").and_then(|s| s.as_str()) {
                    Self::parse_channel_string(ch_str, &mut metrics);
                }

                // Signal / Noise: e.g. "-41 dBm / -95 dBm"
                if let Some(sn_str) = cur.get("spairport_signal_noise").and_then(|s| s.as_str()) {
                    Self::parse_signal_noise(sn_str, &mut metrics);
                }

                // Tx Rate (Mbps)
                if let Some(rate) = cur.get("spairport_network_rate").and_then(|r| r.as_f64()) {
                    metrics.tx_rate_mbps = Some(rate);
                }

                // MCS Index
                if let Some(mcs) = cur.get("spairport_network_mcs").and_then(|m| m.as_u64()) {
                    metrics.mcs_index = Some(mcs as u32);
                }

                break;
            }
        }

        metrics
    }

    fn map_phy_to_generation(phy: &str) -> String {
        let p = phy.to_lowercase();
        if p.contains("ax") {
            "Wi-Fi 6".to_string()
        } else if p.contains("be") {
            "Wi-Fi 7".to_string()
        } else if p.contains("ac") {
            "Wi-Fi 5".to_string()
        } else if p.contains('n') {
            "Wi-Fi 4".to_string()
        } else {
            "Legacy Wi-Fi".to_string()
        }
    }

    fn parse_channel_string(ch_str: &str, metrics: &mut WifiRfMetrics) {
        // Example: "6 (2GHz, 20MHz)"
        let re = Regex::new(r"(\d+)\s*\(([^,]+),\s*(\d+)MHz\)").ok();
        if let Some(re) = re {
            if let Some(cap) = re.captures(ch_str) {
                metrics.channel = cap[1].parse::<u32>().ok();
                metrics.channel_band = Some(cap[2].trim().to_string());
                metrics.channel_width_mhz = cap[3].parse::<u32>().ok();
            }
        }
    }

    fn parse_signal_noise(sn_str: &str, metrics: &mut WifiRfMetrics) {
        // Example: "-41 dBm / -95 dBm"
        let re = Regex::new(r"(-?\d+)\s*dBm\s*/\s*(-?\d+)\s*dBm").ok();
        if let Some(re) = re {
            if let Some(cap) = re.captures(sn_str) {
                if let (Ok(rssi), Ok(noise)) = (cap[1].parse::<i32>(), cap[2].parse::<i32>()) {
                    metrics.rssi_dbm = Some(rssi);
                    metrics.noise_dbm = Some(noise);
                    metrics.snr_db = Some(rssi - noise); // SNR = RSSI - Noise
                }
            }
        }
    }

    /// Query ARP table for gateway MAC
    fn get_gateway_mac(gw_ip: &str) -> Option<String> {
        let output = Command::new("arp").args(["-n", gw_ip]).output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let re = Regex::new(r"at\s+([0-9a-fA-F:]{11,17})").ok()?;
        re.captures(&text).map(|cap| cap[1].to_string())
    }

    /// Probe Gateway with 10 continuous ICMP pings at 50ms interval (-i 0.05).
    /// If bound_interface is provided, binds outgoing socket to that physical interface via macOS ping -b <interface>.
    fn probe_gateway_latency(
        gw_ip: &str,
        bound_interface: Option<&str>,
    ) -> (Vec<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, f64) {
        let mut cmd = Command::new("ping");
        cmd.args(["-c", "10", "-i", "0.05", "-W", "1000"]);
        if let Some(iface) = bound_interface {
            cmd.args(["-b", iface]);
        }
        cmd.arg(gw_ip);
        let mut output = cmd.output();

        // If ping with -b failed, fall back to standard ping without -b
        if let Ok(ref out) = output {
            if !out.status.success() && bound_interface.is_some() {
                output = Command::new("ping")
                    .args(["-c", "10", "-i", "0.05", "-W", "1000", gw_ip])
                    .output();
            }
        }

        let mut samples = Vec::new();
        let mut loss_pct = 0.0;

        let Ok(out) = output else {
            return (samples, None, None, None, None, 100.0);
        };

        let text = String::from_utf8_lossy(&out.stdout);
        let time_re = Regex::new(r"time=([0-9.]+)\s*ms").ok();

        for line in text.lines() {
            if let Some(re) = &time_re {
                if let Some(cap) = re.captures(line) {
                    if let Ok(val) = cap[1].parse::<f64>() {
                        samples.push(val);
                    }
                }
            }
        }

        // Parse summary line for packet loss and stddev:
        // "10 packets transmitted, 10 packets received, 0.0% packet loss"
        let loss_re = Regex::new(r"([0-9.]+)%\s*packet loss").ok();
        if let Some(re) = loss_re {
            if let Some(cap) = re.captures(&text) {
                if let Ok(l) = cap[1].parse::<f64>() {
                    loss_pct = l;
                }
            }
        }

        if samples.is_empty() {
            return (samples, None, None, None, None, 100.0);
        }

        let min_rtt = samples.iter().copied().fold(f64::INFINITY, f64::min);
        let max_rtt = samples.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let sum: f64 = samples.iter().sum();
        let avg_rtt = sum / samples.len() as f64;

        // Calculate standard deviation / Jitter
        let variance: f64 = samples
            .iter()
            .map(|s| {
                let diff = s - avg_rtt;
                diff * diff
            })
            .sum::<f64>()
            / samples.len() as f64;
        let jitter = variance.sqrt();

        (
            samples,
            Some((avg_rtt * 100.0).round() / 100.0),
            Some((min_rtt * 100.0).round() / 100.0),
            Some((max_rtt * 100.0).round() / 100.0),
            Some((jitter * 100.0).round() / 100.0),
            loss_pct,
        )
    }

    fn calculate_signal_quality(
        rssi: Option<i32>,
        snr: Option<i32>,
        jitter: Option<f64>,
        loss_pct: f64,
        port_type: &str,
    ) -> SignalQualityRating {
        if port_type.to_lowercase().contains("ethernet") {
            if loss_pct > 2.0 || jitter.unwrap_or(0.0) > 10.0 {
                return SignalQualityRating::Fair;
            }
            return SignalQualityRating::Excellent;
        }

        let rssi_val = rssi.unwrap_or(-80);
        let snr_val = snr.unwrap_or(15);
        let jit_val = jitter.unwrap_or(0.0);

        if loss_pct > 10.0 || snr_val < 15 || rssi_val < -80 || jit_val > 25.0 {
            SignalQualityRating::Critical
        } else if loss_pct > 3.0 || snr_val < 20 || rssi_val < -75 || jit_val > 15.0 {
            SignalQualityRating::Poor
        } else if snr_val < 28 || rssi_val < -68 || jit_val > 8.0 {
            SignalQualityRating::Fair
        } else if snr_val >= 35 && rssi_val >= -60 && jit_val <= 4.0 {
            SignalQualityRating::Excellent
        } else {
            SignalQualityRating::Good
        }
    }
}

#[derive(Default)]
struct IpconfigSummary {
    ip_address: Option<String>,
    subnet_mask: Option<String>,
    bssid: Option<String>,
    ssid: Option<String>,
    link_status_active: bool,
}

#[derive(Default)]
struct WifiRfMetrics {
    ssid: Option<String>,
    rssi_dbm: Option<i32>,
    noise_dbm: Option<i32>,
    snr_db: Option<i32>,
    channel: Option<u32>,
    channel_width_mhz: Option<u32>,
    channel_band: Option<String>,
    phy_mode: Option<String>,
    standard_generation: Option<String>,
    tx_rate_mbps: Option<f64>,
    mcs_index: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stage1_probe_execution() {
        let result = Stage1Probe::collect_stage1_sync();
        assert!(result.is_ok(), "Stage 1 probe failed: {:?}", result.err());
        let info = result.unwrap();
        println!("\n=== Stage 1 Local Link Discovery Result ===");
        println!("Interface: {} ({})", info.interface_name, info.interface_type);
        println!("MAC Address: {}", info.mac_address);
        println!("IP Address: {:?}", info.ip_address);
        println!("Subnet Mask: {:?}", info.subnet_mask);
        println!("SSID: {:?}", info.ssid);
        println!("BSSID: {:?}", info.bssid);
        println!("Standard: {:?}", info.standard_generation);
        println!("PHY Mode: {:?}", info.phy_mode);
        println!("Channel: {:?} ({:?}, {:?}MHz)", info.channel, info.channel_band, info.channel_width_mhz);
        println!("Signal (RSSI): {:?} dBm", info.rssi_dbm);
        println!("Noise: {:?} dBm", info.noise_dbm);
        println!("SNR: {:?} dB", info.snr_db);
        println!("Tx Rate: {:?} Mbps", info.tx_rate_mbps);
        println!("MCS Index: {:?}", info.mcs_index);
        println!("Gateway IP: {:?}", info.gateway_ip);
        println!("Gateway MAC: {:?}", info.gateway_mac);
        println!("Gateway Samples: {:?}", info.gateway_rtt_samples);
        println!("Gateway Avg RTT: {:?} ms", info.gateway_rtt_avg_ms);
        println!("Gateway Jitter: {:?} ms", info.gateway_jitter_ms);
        println!("Gateway Packet Loss: {}%", info.gateway_packet_loss_pct);
        println!("Signal Quality Rating: {:?}", info.signal_quality);
        println!("Diagnosis Flags: {:?}", info.diagnosis_flags);
        println!("===========================================\n");
    }
}
