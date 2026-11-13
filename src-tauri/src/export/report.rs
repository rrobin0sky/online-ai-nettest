use serde_json::json;

use crate::models::{
    BufferbloatMetric, DiagnosticSummary, DnsBenchmarkResult, MtrHopResult,
    ProxyTopologyInfo, TransportTlsMetric, WiFiInterfaceInfo,
};

pub struct ReportExporter;

impl ReportExporter {
    pub fn generate_markdown(
        link: &WiFiInterfaceInfo,
        proxy: &ProxyTopologyInfo,
        dns: &[DnsBenchmarkResult],
        mtr: &[MtrHopResult],
        bufferbloat: &BufferbloatMetric,
        transport: &TransportTlsMetric,
        summary: &DiagnosticSummary,
    ) -> String {
        let mut md = String::new();

        md.push_str("# NetPath-Lens Pro (链路根因分析仪) - Enterprise Diagnostic Report\n\n");
        md.push_str(&format!("- **Report ID**: `{}`\n", summary.id));
        md.push_str(&format!("- **Timestamp**: {}\n", summary.timestamp));
        md.push_str(&format!("- **Overall Status**: `{:?}`\n", summary.overall_severity));
        md.push_str(&format!("- **Primary Root Cause**: `{:?}`\n\n", summary.primary_cause_category));

        md.push_str("## 1. Executive RCA Summary\n");
        md.push_str(&format!("> **{}**\n\n", summary.headline));
        md.push_str(&format!("{}\n\n", summary.detailed_explanation));
        md.push_str(&format!("**Actionable Recommendation:**\n{}\n\n", summary.actionable_recommendation));

        if !summary.findings.is_empty() {
            md.push_str("### Triggered Diagnostic Rules & Evidence\n");
            for f in &summary.findings {
                md.push_str(&format!(
                    "- `Stage {}` `[{:?}]` **{}** (`{}`): {}\n",
                    f.stage, f.severity, f.message, f.rule_id, f.metric_evidence
                ));
            }
            md.push_str("\n");
        }

        md.push_str("## 2. Stage 1: macOS Local Link & Wi-Fi Physical Telemetry (L1/L2)\n");
        md.push_str("| Metric | Value |\n| :--- | :--- |\n");
        md.push_str(&format!("| Interface | `{}` ({}) |\n", link.interface_name, link.interface_type));
        md.push_str(&format!("| Hardware MAC | `{}` |\n", link.mac_address));
        md.push_str(&format!("| Local IP / Subnet | `{}` / `{}` |\n", link.ip_address.as_deref().unwrap_or("-"), link.subnet_mask.as_deref().unwrap_or("-")));
        md.push_str(&format!("| SSID / BSSID | `{}` / `{}` |\n", link.ssid.as_deref().unwrap_or("-"), link.bssid.as_deref().unwrap_or("-")));
        md.push_str(&format!("| 802.11 Generation / PHY | `{}` ({}) |\n", link.standard_generation.as_deref().unwrap_or("-"), link.phy_mode.as_deref().unwrap_or("-")));
        md.push_str(&format!("| Channel / Bandwidth | Channel {} ({}, {}MHz) |\n", link.channel.unwrap_or(0), link.channel_band.as_deref().unwrap_or("-"), link.channel_width_mhz.unwrap_or(0)));
        md.push_str(&format!("| RSSI / Noise / SNR | {} dBm / {} dBm / **{} dB** |\n", link.rssi_dbm.unwrap_or(0), link.noise_dbm.unwrap_or(0), link.snr_db.unwrap_or(0)));
        md.push_str(&format!("| Tx Rate / MCS Index | {} Mbps / MCS {} |\n", link.tx_rate_mbps.unwrap_or(0.0), link.mcs_index.unwrap_or(0)));
        md.push_str(&format!("| Gateway IP / MAC | `{}` / `{}` |\n", link.gateway_ip.as_deref().unwrap_or("-"), link.gateway_mac.as_deref().unwrap_or("-")));
        md.push_str(&format!("| Gateway Ping Jitter | Avg: **{:.1}ms**, Min: {:.1}ms, Max: {:.1}ms, Jitter: **{:.1}ms**, Loss: {:.1}% |\n\n",
            link.gateway_rtt_avg_ms.unwrap_or(0.0), link.gateway_rtt_min_ms.unwrap_or(0.0),
            link.gateway_rtt_max_ms.unwrap_or(0.0), link.gateway_jitter_ms.unwrap_or(0.0),
            link.gateway_packet_loss_pct));

        md.push_str("## 3. Stage 2: Office DNS & Proxy Topology (L3/L7)\n");
        md.push_str(&format!("- **System Proxy**: Enabled: `{}` (HTTP: `{}`, HTTPS: `{}`, SOCKS: `{}`)\n\n",
            proxy.proxy_enabled,
            proxy.http_proxy.as_deref().unwrap_or("None"),
            proxy.https_proxy.as_deref().unwrap_or("None"),
            proxy.socks_proxy.as_deref().unwrap_or("None")));

        md.push_str("| Resolver | IP | Category | Latency | Status | Resolved IPs |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n");
        for d in dns {
            let def_tag = if d.is_system_default { " (Default)" } else { "" };
            md.push_str(&format!(
                "| {}{} | `{}` | `{:?}` | {:.1}ms | `{:?}` | `{}` |\n",
                d.resolver_name, def_tag, d.resolver_ip, d.resolver_category,
                d.latency_ms.unwrap_or(0.0), d.status, d.resolved_ips.join(", ")
            ));
        }
        md.push_str("\n");

        md.push_str("## 4. Stage 3: WAN Backbone & Visual Hop-by-Hop MTR (L3/L4)\n");
        md.push_str("| Hop | IP | ASN & Organization | Geo Location | Sent | Recv | Loss% | Avg RTT | Jitter | Bottleneck |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n");
        for h in mtr {
            md.push_str(&format!(
                "| {} | `{}` | {} | {} | {} | {} | {:.1}% | {:.1}ms | {:.1}ms | {} |\n",
                h.hop_number,
                h.ip.as_deref().unwrap_or("* * *"),
                h.asn_org.as_deref().unwrap_or("-"),
                h.geo.as_deref().unwrap_or("-"),
                h.sent_count, h.received_count, h.loss_pct,
                h.avg_rtt_ms.unwrap_or(0.0),
                h.stddev_jitter_ms.unwrap_or(0.0),
                if h.is_bottleneck { "**YES (ALERT)**" } else { "No" }
            ));
        }
        md.push_str("\n");

        md.push_str("## 5. Stage 4 & 5: Bufferbloat & Transport Performance\n");
        md.push_str("| Metric | Measured Result | Evaluation |\n| :--- | :--- | :--- |\n");
        md.push_str(&format!("| Unloaded Latency | {:.1} ms | Baseline |\n", bufferbloat.unloaded_latency_ms));
        md.push_str(&format!("| Loaded Latency (Download / Upload) | {:.1} ms / {:.1} ms | Active saturation |\n", bufferbloat.loaded_download_latency_ms, bufferbloat.loaded_upload_latency_ms));
        md.push_str(&format!("| Bufferbloat Delta | +{:.1} ms | Grade: **{}** (RPM: {}) |\n", bufferbloat.bufferbloat_delta_ms, bufferbloat.grade, bufferbloat.rpm));
        md.push_str(&format!("| TCP 3-Way Handshake | {:.1} ms | SYN -> SYN-ACK -> ACK |\n", transport.tcp_handshake_ms));
        md.push_str(&format!("| TLS 1.3 Handshake | {:.1} ms | ClientHello -> Finished ({}) |\n", transport.tls_handshake_ms, transport.tls_version));
        md.push_str(&format!("| Time to First Byte (TTFB) | {:.1} ms | Transport layer responsiveness |\n", transport.ttfb_ms));
        md.push_str(&format!("| Path MTU / Blackhole | MTU: {} | PMTU Blackhole: `{}` |\n\n", transport.path_mtu, transport.pmtu_blackhole_detected));

        md.push_str("---\n*Generated by NetPath-Lens Pro - macOS Enterprise Diagnostic Telemetry Engine*");
        md
    }

    pub fn generate_json(
        link: &WiFiInterfaceInfo,
        proxy: &ProxyTopologyInfo,
        dns: &[DnsBenchmarkResult],
        mtr: &[MtrHopResult],
        bufferbloat: &BufferbloatMetric,
        transport: &TransportTlsMetric,
        summary: &DiagnosticSummary,
    ) -> String {
        let payload = json!({
            "report_id": summary.id,
            "timestamp": summary.timestamp,
            "summary": summary,
            "stage1_local_link": link,
            "stage2_proxy": proxy,
            "stage2_dns_benchmark": dns,
            "stage3_mtr_telemetry": mtr,
            "stage4_bufferbloat": bufferbloat,
            "stage5_transport_tls": transport
        });

        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
    }
}
