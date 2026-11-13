use chrono::Local;

use crate::models::{
    BufferbloatMetric, DiagnosticSummary, DnsBenchmarkResult, DnsStatus,
    MtrHopResult, ProxyTopologyInfo, RcaCategory, RcaFinding, SeverityLevel,
    TransportTlsMetric, WiFiInterfaceInfo,
};

pub struct RcaEngine;

impl RcaEngine {
    pub fn evaluate(
        link: &WiFiInterfaceInfo,
        proxy: &ProxyTopologyInfo,
        dns: &[DnsBenchmarkResult],
        mtr: &[MtrHopResult],
        bufferbloat: &BufferbloatMetric,
        transport: &TransportTlsMetric,
    ) -> DiagnosticSummary {
        let mut findings: Vec<RcaFinding> = Vec::new();
        let mut affected_stages: Vec<u32> = Vec::new();

        // ---------------- DATA-PLANE HEALTH CHECK ----------------
        let sys_dns = dns.iter().find(|d| d.is_system_default).or_else(|| dns.first());
        let is_dns_clean = sys_dns
            .map(|d| d.status == DnsStatus::Success && d.latency_ms.unwrap_or(999.0) < 120.0)
            .unwrap_or(false);
        let is_tcp_clean = transport.tcp_handshake_ms > 0.0 && transport.tcp_handshake_ms < 250.0;
        let is_ttfb_clean = transport.ttfb_ms > 0.0 && transport.ttfb_ms < 600.0;
        let is_pmtu_clean = !transport.pmtu_blackhole_detected;
        let is_data_plane_healthy = is_dns_clean && is_tcp_clean && is_ttfb_clean && is_pmtu_clean;

        // ---------------- STAGE 1: LOCAL LINK & WI-FI ----------------
        if let Some(snr) = link.snr_db {
            if snr < 20 {
                affected_stages.push(1);
                findings.push(RcaFinding {
                    stage: 1,
                    severity: SeverityLevel::Degraded,
                    rule_id: "RULE_WIFI_WEAK_SNR".to_string(),
                    message: "Wi-Fi Signal Weak / High RF Noise".to_string(),
                    metric_evidence: format!("SNR: {} dB (threshold < 20 dB), Noise: {:?} dBm", snr, link.noise_dbm),
                });
            }
        }

        if let Some(rssi) = link.rssi_dbm {
            if rssi < -75 {
                if !affected_stages.contains(&1) {
                    affected_stages.push(1);
                }
                findings.push(RcaFinding {
                    stage: 1,
                    severity: SeverityLevel::Degraded,
                    rule_id: "RULE_WIFI_WEAK_RSSI".to_string(),
                    message: "Low Wi-Fi RSSI Signal Strength".to_string(),
                    metric_evidence: format!("RSSI: {} dBm (threshold < -75 dBm)", rssi),
                });
            }
        }

        if let Some(jit) = link.gateway_jitter_ms {
            if jit > 15.0 {
                affected_stages.push(1);
                findings.push(RcaFinding {
                    stage: 1,
                    severity: SeverityLevel::Critical,
                    rule_id: "RULE_GATEWAY_JITTER_HIGH".to_string(),
                    message: "High Local Gateway Jitter / AP Roaming Flapping".to_string(),
                    metric_evidence: format!("Gateway Jitter: {:.1}ms (threshold > 15.0ms)", jit),
                });
            }
        }

        if link.gateway_packet_loss_pct > 3.0 {
            affected_stages.push(1);
            findings.push(RcaFinding {
                stage: 1,
                severity: SeverityLevel::Critical,
                rule_id: "RULE_GATEWAY_LOSS".to_string(),
                message: "Local Gateway Packet Loss".to_string(),
                metric_evidence: format!("Default Gateway Loss: {:.1}%", link.gateway_packet_loss_pct),
            });
        }

        // ---------------- STAGE 2: DNS & PROXY ----------------
        if proxy.proxy_enabled {
            findings.push(RcaFinding {
                stage: 2,
                severity: SeverityLevel::Normal,
                rule_id: "RULE_PROXY_ACTIVE".to_string(),
                message: "System Proxy In Use".to_string(),
                metric_evidence: format!(
                    "Active Proxies: HTTP: {}, SOCKS: {}",
                    proxy.http_proxy.as_deref().unwrap_or("None"),
                    proxy.socks_proxy.as_deref().unwrap_or("None")
                ),
            });
        }

        let pub_dns = dns.iter().filter(|d| !d.is_system_default && d.status == DnsStatus::Success);

        if let Some(sys) = sys_dns {
            if let Some(sys_lat) = sys.latency_ms {
                let min_pub_lat = pub_dns
                    .filter_map(|d| d.latency_ms)
                    .fold(f64::INFINITY, f64::min);

                if sys_lat > 60.0 && min_pub_lat < 25.0 {
                    affected_stages.push(2);
                    findings.push(RcaFinding {
                        stage: 2,
                        severity: SeverityLevel::Degraded,
                        rule_id: "RULE_DNS_CONGESTION".to_string(),
                        message: "Enterprise Local DNS Forwarder Congested".to_string(),
                        metric_evidence: format!("Local DNS Latency: {:.1}ms vs Public DNS: {:.1}ms", sys_lat, min_pub_lat),
                    });
                }
            }

            if sys.geo_mismatch {
                affected_stages.push(2);
                findings.push(RcaFinding {
                    stage: 2,
                    severity: SeverityLevel::Degraded,
                    rule_id: "RULE_DNS_SPLIT_HORIZON".to_string(),
                    message: "DNS Split-Horizon or GeoDNS Misrouting Detected".to_string(),
                    metric_evidence: "System local DNS resolved destination IP differs completely from public Anycast nodes".to_string(),
                });
            }
        }

        // ---------------- STAGE 3: WAN BACKBONE & MTR ----------------
        // CoPP Rate Limiting informational finding
        let copp_hops: Vec<&MtrHopResult> = mtr
            .iter()
            .filter(|h| h.anomaly_type.as_deref() == Some("ICMP_RATE_LIMITED"))
            .collect();
        if !copp_hops.is_empty() {
            let hop_list = copp_hops
                .iter()
                .map(|h| format!("#{}", h.hop_number))
                .collect::<Vec<_>>()
                .join(", ");
            findings.push(RcaFinding {
                stage: 3,
                severity: SeverityLevel::Normal,
                rule_id: "RULE_MTR_COPP_FILTERED".to_string(),
                message: "Intermediate Router Control Plane Policing (CoPP) Detected".to_string(),
                metric_evidence: format!(
                    "Hops [{}] rate-limited ICMP; downstream traffic and data-plane remain lossless.",
                    hop_list
                ),
            });
        }

        // Edge drop informational finding
        let edge_drop_hops: Vec<&MtrHopResult> = mtr
            .iter()
            .filter(|h| h.anomaly_type.as_deref() == Some("EDGE_FIREWALL_ICMP_DROP"))
            .collect();
        if !edge_drop_hops.is_empty() {
            let hop_list = edge_drop_hops
                .iter()
                .map(|h| format!("#{}", h.hop_number))
                .collect::<Vec<_>>()
                .join(", ");
            findings.push(RcaFinding {
                stage: 3,
                severity: SeverityLevel::Normal,
                rule_id: "RULE_MTR_EDGE_FIREWALL_FILTERED".to_string(),
                message: "Destination Edge Firewall ICMP Drop Detected".to_string(),
                metric_evidence: format!(
                    "Edge nodes [{}] dropped ICMP ECHO; verified reachable via L4 TCP ({:.1}ms).",
                    hop_list, transport.tcp_handshake_ms
                ),
            });
        }

        let bottleneck_hop = mtr.iter().find(|h| h.is_bottleneck);
        if let Some(b) = bottleneck_hop {
            if !is_data_plane_healthy {
                affected_stages.push(3);
                findings.push(RcaFinding {
                    stage: 3,
                    severity: SeverityLevel::Critical,
                    rule_id: "RULE_MTR_BOTTLENECK".to_string(),
                    message: format!("WAN Transit Bottleneck Isolated at Hop #{}", b.hop_number),
                    metric_evidence: format!(
                        "Hop #{} [{} - {}]: Loss: {:.1}%, Avg RTT: {:.1}ms",
                        b.hop_number,
                        b.ip.as_deref().unwrap_or("*"),
                        b.asn_org.as_deref().unwrap_or("Unknown ASN"),
                        b.loss_pct,
                        b.avg_rtt_ms.unwrap_or(0.0)
                    ),
                });
            }
        }

        // Cross-border congestion check
        let high_rtt_border = mtr.iter().any(|h| {
            h.avg_rtt_ms.unwrap_or(0.0) > 180.0
                && h.loss_pct >= 10.0
                && h.asn_org.as_deref().unwrap_or("").contains("Backbone")
        });
        if high_rtt_border && bottleneck_hop.is_none() && !is_data_plane_healthy {
            affected_stages.push(3);
            findings.push(RcaFinding {
                stage: 3,
                severity: SeverityLevel::Degraded,
                rule_id: "RULE_BORDER_CONGESTION".to_string(),
                message: "International Cross-Border Gateway / Cable Congestion".to_string(),
                metric_evidence: "Border gateway hop latency surged > 180ms with persistent packet loss".to_string(),
            });
        }

        // ---------------- STAGE 4: BUFFERBLOAT ----------------
        if bufferbloat.bufferbloat_delta_ms > 80.0 {
            affected_stages.push(4);
            findings.push(RcaFinding {
                stage: 4,
                severity: if is_data_plane_healthy {
                    SeverityLevel::Degraded
                } else {
                    SeverityLevel::Critical
                },
                rule_id: "RULE_BUFFERBLOAT_SATURATION".to_string(),
                message: "Severe Bufferbloat Detected on Office Egress Router".to_string(),
                metric_evidence: format!(
                    "Bufferbloat Delta: +{:.1}ms (threshold > +80ms), RPM: {}, Grade: {}",
                    bufferbloat.bufferbloat_delta_ms, bufferbloat.rpm, bufferbloat.grade
                ),
            });
        }

        // ---------------- STAGE 5: TRANSPORT & TLS ----------------
        if transport.pmtu_blackhole_detected {
            affected_stages.push(5);
            findings.push(RcaFinding {
                stage: 5,
                severity: SeverityLevel::Critical,
                rule_id: "RULE_PMTU_BLACKHOLE".to_string(),
                message: "Path MTU Blackhole Detected (DF packet dropped without ICMP)".to_string(),
                metric_evidence: format!("Negotiated MTU: {}, Standard 1500 byte packet failed", transport.path_mtu),
            });
        }

        affected_stages.sort();
        affected_stages.dedup();

        // ---------------- DATA-PLANE FIRST ARBITRATION ----------------
        let (overall_severity, primary_cause, headline, explanation, recommendation) = if is_data_plane_healthy {
            let has_local_degraded = findings.iter().any(|f| {
                f.severity == SeverityLevel::Degraded
                    && matches!(
                        f.rule_id.as_str(),
                        "RULE_WIFI_WEAK_SNR"
                            | "RULE_WIFI_WEAK_RSSI"
                            | "RULE_DNS_CONGESTION"
                            | "RULE_BUFFERBLOAT_SATURATION"
                    )
            });

            if has_local_degraded {
                let degraded_finding = findings.iter().find(|f| f.severity == SeverityLevel::Degraded).unwrap();
                let primary_cause = if degraded_finding.rule_id.starts_with("RULE_WIFI") {
                    RcaCategory::LocalWiFi
                } else if degraded_finding.rule_id == "RULE_BUFFERBLOAT_SATURATION" {
                    RcaCategory::Bufferbloat
                } else if degraded_finding.rule_id == "RULE_DNS_CONGESTION" {
                    RcaCategory::LocalDNS
                } else {
                    RcaCategory::LocalWiFi
                };
                (
                    SeverityLevel::Degraded,
                    primary_cause,
                    format!("Data-Plane Healthy with Minor Advisory: {}", degraded_finding.message),
                    format!(
                        "L4/L7 transport is verified healthy (TCP: {:.1}ms, TTFB: {:.1}ms). Local link advisory noted: {}.",
                        transport.tcp_handshake_ms, transport.ttfb_ms, degraded_finding.metric_evidence
                    ),
                    "Network transport is functional. Consider optimizing local AP placement or router queue settings.".to_string(),
                )
            } else {
                let (headline, explanation, recommendation) = if !copp_hops.is_empty() || !edge_drop_hops.is_empty() {
                    (
                        "Data-Plane Verified: Optimal End-to-End Enterprise Connectivity (ICMP Artifacts Filtered)".to_string(),
                        format!(
                            "Data-plane performance is fully verified: DNS ({:.1}ms), TCP 3-way handshake ({:.1}ms), and TTFB ({:.1}ms) are lossless. Packet loss observed at intermediate MTR hops is attributed to router Control Plane Policing (CoPP) or ICMP rate-limiting and does not affect application traffic.",
                            sys_dns.and_then(|d| d.latency_ms).unwrap_or(0.0),
                            transport.tcp_handshake_ms,
                            transport.ttfb_ms
                        ),
                        "No escalation required. Real user application traffic is unaffected by router ICMP rate-limiting.".to_string(),
                    )
                } else {
                    (
                        "Optimal End-to-End Enterprise Connectivity".to_string(),
                        "All 5 diagnostic layers (L1 Wi-Fi, L2 Gateway, L3 DNS/MTR, L4 Bufferbloat, L7 TLS) meet or exceed enterprise SLAs.".to_string(),
                        "No immediate action required. Telemetry baseline verified.".to_string(),
                    )
                };
                (SeverityLevel::Normal, RcaCategory::Healthy, headline, explanation, recommendation)
            }
        } else if let Some(crit) = findings.iter().find(|f| f.severity == SeverityLevel::Critical) {
            match crit.rule_id.as_str() {
                "RULE_GATEWAY_JITTER_HIGH" | "RULE_GATEWAY_LOSS" => (
                    SeverityLevel::Critical,
                    RcaCategory::LocalGateway,
                    "Local Gateway / AP Instability Detected".to_string(),
                    format!("Deterministic root cause: Local gateway {} exhibits severe jitter or packet loss ({}).", link.gateway_ip.as_deref().unwrap_or("Default Gateway"), crit.metric_evidence),
                    "Verify enterprise AP channel utilization, check for co-channel interference or reboot the local switch/router.".to_string(),
                ),
                "RULE_MTR_BOTTLENECK" => (
                    SeverityLevel::Critical,
                    RcaCategory::DomesticISP,
                    "External WAN Backbone Peering Congestion".to_string(),
                    format!("Deterministic root cause: Local Wi-Fi and Gateway are healthy. Packet loss starts at external peering node ({}).", crit.metric_evidence),
                    "Escalate ticket to upstream ISP / Transit provider with the provided MTR traceroute telemetry.".to_string(),
                ),
                "RULE_BUFFERBLOAT_SATURATION" => (
                    SeverityLevel::Critical,
                    RcaCategory::Bufferbloat,
                    "Egress Router Bufferbloat Queue Saturation".to_string(),
                    format!("Deterministic root cause: Egress router lacks active queue management (SQM/FQ-CoDel/CAKE). Under concurrent load, latency spikes by +{:.1}ms.", bufferbloat.bufferbloat_delta_ms),
                    "Enable Smart Queue Management (SQM) or FQ-CoDel on the office border firewall/router to cap bufferbloat.".to_string(),
                ),
                "RULE_PMTU_BLACKHOLE" => (
                    SeverityLevel::Critical,
                    RcaCategory::DomesticISP,
                    "Path MTU Blackhole on Transit Link".to_string(),
                    "Intermediate router silently discards packets larger than MTU without sending ICMP Fragmentation Needed.".to_string(),
                    "Configure TCP MSS Clamping to 1420 on egress firewall or tune client interface MTU.".to_string(),
                ),
                _ => (
                    SeverityLevel::Critical,
                    RcaCategory::LocalWiFi,
                    "Local Link Degradation".to_string(),
                    crit.message.clone(),
                    "Inspect local physical layer cabling or Wi-Fi configuration.".to_string(),
                ),
            }
        } else if let Some(warn) = findings.iter().find(|f| f.severity == SeverityLevel::Degraded) {
            match warn.rule_id.as_str() {
                "RULE_WIFI_WEAK_SNR" | "RULE_WIFI_WEAK_RSSI" => (
                    SeverityLevel::Degraded,
                    RcaCategory::LocalWiFi,
                    "Wi-Fi RF Signal Degradation".to_string(),
                    format!("Local Wi-Fi SNR/RSSI is below enterprise standard ({}).", warn.metric_evidence),
                    "Move closer to access point or switch to an unoccupied 5GHz / 6GHz Wi-Fi 6 channel.".to_string(),
                ),
                "RULE_DNS_CONGESTION" => (
                    SeverityLevel::Degraded,
                    RcaCategory::LocalDNS,
                    "Local Enterprise DNS Forwarder Sluggish".to_string(),
                    format!("Local enterprise DNS resolution takes significantly longer than public Anycast resolvers ({}).", warn.metric_evidence),
                    "Check load on internal Windows Server AD DNS forwarder or flush local resolver cache.".to_string(),
                ),
                "RULE_BORDER_CONGESTION" => (
                    SeverityLevel::Degraded,
                    RcaCategory::BorderGateway,
                    "International Undersea Cable / Border Peering Congestion".to_string(),
                    "Zero loss on local LAN and domestic backbone, but cross-border transit gateway latency surged.".to_string(),
                    "Route international traffic through enterprise SD-WAN or dedicated CN2/GIA international MPLS lines.".to_string(),
                ),
                _ => (
                    SeverityLevel::Degraded,
                    RcaCategory::LocalWiFi,
                    "Partial Network Degradation".to_string(),
                    warn.message.clone(),
                    "Monitor telemetry and verify network load.".to_string(),
                ),
            }
        } else {
            (
                SeverityLevel::Normal,
                RcaCategory::Healthy,
                "Optimal End-to-End Enterprise Connectivity".to_string(),
                "All 5 diagnostic layers (L1 Wi-Fi, L2 Gateway, L3 DNS/MTR, L4 Bufferbloat, L7 TLS) meet or exceed enterprise SLAs.".to_string(),
                "No immediate action required. Telemetry baseline verified.".to_string(),
            )
        };

        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let id = format!("RCA-{}", Local::now().timestamp());

        DiagnosticSummary {
            id,
            timestamp: now,
            overall_severity,
            primary_cause_category: primary_cause,
            headline,
            detailed_explanation: explanation,
            actionable_recommendation: recommendation,
            affected_stages,
            findings,
            export_markdown: String::new(),
            export_json: String::new(),
        }
    }
}
