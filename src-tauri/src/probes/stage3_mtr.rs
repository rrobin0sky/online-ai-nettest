use std::process::Command;
use regex::Regex;

use crate::models::{HopStatus, MtrHopResult};

pub struct Stage3MtrProbe;

impl Stage3MtrProbe {
    pub async fn run_traceroute_mtr(
        target_name: &str,
        target_host: &str,
        protocol: Option<&str>,
    ) -> Result<Vec<MtrHopResult>, String> {
        let name = target_name.to_string();
        let host = target_host.to_string();
        let proto = protocol.unwrap_or("ICMP").to_string();

        tokio::task::spawn_blocking(move || Self::execute_adaptive_mtr_sync(&name, &host, &proto))
            .await
            .map_err(|e| format!("MTR execution error: {}", e))
    }

    /// Two-Stage Adaptive Probing:
    /// Stage 1: Run 10 probes per hop.
    /// Stage 2: If any intermediate hop exhibits loss > 0% while the target or downstream
    /// is reachable, automatically re-sample with 30 probes for high statistical confidence.
    fn execute_adaptive_mtr_sync(
        target_name: &str,
        target_host: &str,
        requested_proto: &str,
    ) -> Vec<MtrHopResult> {
        // Initial pass with 10 packets for speed
        let (mut hops, actual_proto) = Self::run_probe_pass(target_name, target_host, requested_proto, 10);

        if hops.is_empty() {
            return hops;
        }

        // Check if any intermediate hop has packet loss > 0% while downstream nodes respond
        let has_intermediate_loss = hops.iter().enumerate().any(|(i, h)| {
            h.loss_pct > 0.0 && hops.iter().skip(i + 1).any(|downstream| downstream.received_count > 0)
        });

        // If intermediate loss detected, run extended 30-packet probe for statistical rigor
        if has_intermediate_loss {
            let (extended_hops, _) = Self::run_probe_pass(target_name, target_host, &actual_proto, 30);
            if !extended_hops.is_empty() {
                hops = extended_hops;
            }
        }

        // Apply topological CoPP and Edge firewall drop classification
        Self::sanitize_and_classify_hops(&mut hops);

        hops
    }

    fn run_probe_pass(
        target_name: &str,
        target_host: &str,
        proto: &str,
        probe_count: u32,
    ) -> (Vec<MtrHopResult>, String) {
        let count_str = probe_count.to_string();
        let mut actual_proto = proto.to_string();

        let mut output = None;

        if proto.eq_ignore_ascii_case("TCP") {
            // Attempt TCP SYN traceroute to port 443
            let tcp_res = Command::new("traceroute")
                .args(["-n", "-P", "TCP", "-p", "443", "-q", &count_str, "-m", "15", "-w", "2", target_host])
                .output();

            match tcp_res {
                Ok(out) if out.status.success() => {
                    output = Some(out);
                    actual_proto = "TCP (443)".to_string();
                }
                _ => {
                    // Fallback to ICMP ECHO if non-root / pcap error
                    actual_proto = "ICMP (TCP Fallback)".to_string();
                }
            }
        }

        if output.is_none() {
            // Try ICMP traceroute (-I)
            let icmp_res = Command::new("traceroute")
                .args(["-n", "-I", "-q", &count_str, "-m", "15", "-w", "2", target_host])
                .output();

            match icmp_res {
                Ok(out) if out.status.success() => {
                    output = Some(out);
                }
                _ => {
                    // Fallback to standard UDP traceroute
                    let udp_res = Command::new("traceroute")
                        .args(["-n", "-q", &count_str, "-m", "15", "-w", "2", target_host])
                        .output();
                    if let Ok(out) = udp_res {
                        output = Some(out);
                    }
                }
            }
        }

        let mut hops: Vec<MtrHopResult> = Vec::new();
        let Some(out) = output else {
            return (hops, actual_proto);
        };

        let text = String::from_utf8_lossy(&out.stdout);
        let hop_re = Regex::new(r"^\s*(\d+)\s+([^\n\r]+)").ok();
        let ip_re = Regex::new(r"([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})").ok();
        let time_re = Regex::new(r"([0-9.]+)\s*ms").ok();

        for line in text.lines() {
            let Some(ref h_re) = hop_re else { continue };
            let Some(h_cap) = h_re.captures(line) else { continue };

            let hop_num = h_cap[1].parse::<u32>().unwrap_or(0);
            let rest = &h_cap[2];

            // Extract IP
            let mut ip = None;
            if let Some(ref i_re) = ip_re {
                if let Some(i_cap) = i_re.captures(rest) {
                    ip = Some(i_cap[1].to_string());
                }
            }

            // Extract probe times
            let mut times: Vec<f64> = Vec::new();
            if let Some(ref t_re) = time_re {
                for t_cap in t_re.captures_iter(rest) {
                    if let Ok(val) = t_cap[1].parse::<f64>() {
                        times.push(val);
                    }
                }
            }

            let sent_count = probe_count;
            let received_count = times.len() as u32;
            let loss_pct = if sent_count > 0 {
                let diff = sent_count.saturating_sub(received_count);
                ((diff as f64 / sent_count as f64) * 100.0 * 10.0).round() / 10.0
            } else {
                0.0
            };

            let (last_rtt, avg_rtt, best_rtt, worst_rtt, stddev) = if !times.is_empty() {
                let best = times.iter().copied().fold(f64::INFINITY, f64::min);
                let worst = times.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let sum: f64 = times.iter().sum();
                let avg = sum / times.len() as f64;
                let last = *times.last().unwrap_or(&avg);

                let variance: f64 = times
                    .iter()
                    .map(|t| (t - avg).powi(2))
                    .sum::<f64>()
                    / times.len() as f64;
                let sd = variance.sqrt();

                (
                    Some((last * 10.0).round() / 10.0),
                    Some((avg * 10.0).round() / 10.0),
                    Some((best * 10.0).round() / 10.0),
                    Some((worst * 10.0).round() / 10.0),
                    Some((sd * 100.0).round() / 100.0),
                )
            } else {
                (None, None, None, None, None)
            };

            // Enrichment: ASN & Geo lookup
            let (asn, asn_org, geo) = if let Some(ref ip_str) = ip {
                Self::lookup_ip_meta(ip_str)
            } else {
                (None, None, None)
            };

            // Status determination
            let status = if times.is_empty() {
                HopStatus::Unresponsive
            } else if loss_pct > 0.0 {
                HopStatus::PacketLoss
            } else if avg_rtt.unwrap_or(0.0) > 150.0 {
                HopStatus::HighLatency
            } else {
                HopStatus::Healthy
            };

            let sparkline_samples = if !times.is_empty() {
                times.clone()
            } else {
                vec![0.0; sent_count.min(10) as usize]
            };

            hops.push(MtrHopResult {
                target_name: target_name.to_string(),
                target_host: target_host.to_string(),
                hop_number: hop_num,
                ip,
                hostname: None,
                asn,
                asn_org,
                geo,
                sent_count,
                received_count,
                loss_pct,
                last_rtt_ms: last_rtt,
                avg_rtt_ms: avg_rtt,
                best_rtt_ms: best_rtt,
                worst_rtt_ms: worst_rtt,
                stddev_jitter_ms: stddev,
                sparkline_samples,
                status,
                is_bottleneck: false,
                anomaly_type: None,
                probe_protocol: Some(actual_proto.clone()),
            });
        }

        (hops, actual_proto)
    }

    /// Topologically classify every hop to filter out CoPP rate-limiting and edge firewall drops
    pub fn sanitize_and_classify_hops(hops: &mut [MtrHopResult]) {
        let total_hops = hops.len();
        if total_hops == 0 {
            return;
        }

        // 1. Identify trailing edge hops dropping ICMP
        let mut first_trailing_drop_idx = total_hops;
        for i in (0..total_hops).rev() {
            if hops[i].received_count == 0 || hops[i].loss_pct >= 99.9 {
                first_trailing_drop_idx = i;
            } else {
                break;
            }
        }

        if first_trailing_drop_idx < total_hops && first_trailing_drop_idx > 0 {
            for i in first_trailing_drop_idx..total_hops {
                hops[i].anomaly_type = Some("EDGE_FIREWALL_ICMP_DROP".to_string());
                hops[i].is_bottleneck = false;
            }
        }

        // 2. Identify CoPP / ICMP Rate Limiting on intermediate hops
        for i in 0..total_hops {
            if hops[i].anomaly_type.as_deref() == Some("EDGE_FIREWALL_ICMP_DROP") {
                continue;
            }

            if hops[i].loss_pct > 0.0 {
                // Check downstream responsive hops
                let downstream_has_lower_loss = hops[i + 1..]
                    .iter()
                    .any(|d| d.received_count > 0 && d.loss_pct < hops[i].loss_pct);

                let downstream_loss_zero = hops[i + 1..]
                    .iter()
                    .any(|d| d.received_count > 0 && d.loss_pct == 0.0);

                if downstream_has_lower_loss || downstream_loss_zero {
                    hops[i].anomaly_type = Some("ICMP_RATE_LIMITED".to_string());
                    hops[i].is_bottleneck = false;
                }
            }
        }

        // 3. Genuine Bottleneck Isolation
        // A hop is ONLY a bottleneck if:
        // - Loss >= 20%
        // - NOT ICMP_RATE_LIMITED and NOT EDGE_FIREWALL_ICMP_DROP
        // - Downstream responsive hops persistently maintain loss >= 15%
        let mut genuine_bottleneck_idx = None;
        for i in 0..total_hops {
            let hop = &hops[i];
            if hop.loss_pct >= 20.0
                && hop.anomaly_type.is_none()
                && hop.status != HopStatus::Unresponsive
            {
                let downstream: Vec<&MtrHopResult> = hops[i + 1..]
                    .iter()
                    .filter(|h| h.received_count > 0 && h.anomaly_type.as_deref() != Some("EDGE_FIREWALL_ICMP_DROP"))
                    .collect();

                if !downstream.is_empty() {
                    let sustained_count = downstream.iter().filter(|h| h.loss_pct >= 15.0).count();
                    if sustained_count >= (downstream.len() * 3 / 4) {
                        genuine_bottleneck_idx = Some(i);
                        break;
                    }
                }
            }
        }

        if let Some(idx) = genuine_bottleneck_idx {
            hops[idx].is_bottleneck = true;
            hops[idx].anomaly_type = Some("GENUINE_LOSS".to_string());
        }
    }

    /// Fast local ASN / Geo heuristic dictionary
    fn lookup_ip_meta(ip: &str) -> (Option<String>, Option<String>, Option<String>) {
        if ip.starts_with("10.") || ip.starts_with("192.168.") || ip.starts_with("172.16.") || ip.starts_with("172.20.") {
            return (
                Some("LAN".to_string()),
                Some("Internal / Corporate Gateway".to_string()),
                Some("Local Subnet".to_string()),
            );
        }

        if ip.starts_with("100.64.") {
            return (
                Some("CGNAT".to_string()),
                Some("ISP Carrier Grade NAT".to_string()),
                Some("Metropolitan Network".to_string()),
            );
        }

        if ip.starts_with("202.97.") {
            return (
                Some("AS4134".to_string()),
                Some("China Telecom 163 Backbone".to_string()),
                Some("China Egress Core".to_string()),
            );
        }

        if ip.starts_with("59.43.") {
            return (
                Some("AS4809".to_string()),
                Some("China Telecom CN2 Premium (GIA/BGP)".to_string()),
                Some("Tier-1 CN2 Route".to_string()),
            );
        }

        if ip.starts_with("219.158.") {
            return (
                Some("AS4837".to_string()),
                Some("China Unicom 169 Backbone".to_string()),
                Some("China Unicom Core".to_string()),
            );
        }

        if ip.starts_with("223.5.") || ip.starts_with("47.") || ip.starts_with("106.11.") {
            return (
                Some("AS37963".to_string()),
                Some("Alibaba Cloud BGP Egress".to_string()),
                Some("Hangzhou, CN".to_string()),
            );
        }

        if ip.starts_with("1.1.1.") || ip.starts_with("1.0.0.") {
            return (
                Some("AS13335".to_string()),
                Some("Cloudflare, Inc. Anycast".to_string()),
                Some("Global Anycast Edge".to_string()),
            );
        }

        if ip.starts_with("8.8.8.") || ip.starts_with("8.8.4.") {
            return (
                Some("AS15169".to_string()),
                Some("Google LLC Anycast".to_string()),
                Some("Global Edge".to_string()),
            );
        }

        (
            Some("WAN".to_string()),
            Some("Transit Provider / Peering Hop".to_string()),
            Some("Internet Backbone".to_string()),
        )
    }
}
