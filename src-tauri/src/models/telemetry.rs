use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SeverityLevel {
    Normal,
    Degraded,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SignalQualityRating {
    Excellent,
    Good,
    Fair,
    Poor,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RcaCategory {
    LocalWiFi,
    LocalGateway,
    LocalDNS,
    EgressProxy,
    DomesticISP,
    BorderGateway,
    TargetServer,
    Bufferbloat,
    Healthy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResolverCategory {
    SystemLocal,
    ChinaPublic,
    GlobalPublic,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DnsStatus {
    Success,
    Timeout,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HopStatus {
    Healthy,
    HighLatency,
    PacketLoss,
    Unresponsive,
}

/// Stage 1: macOS Local Link & Wi-Fi Telemetry (L1/L2)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiFiInterfaceInfo {
    pub interface_name: String,
    pub mac_address: String,
    pub interface_type: String, // "Wi-Fi", "Ethernet", "Thunderbolt"
    pub ip_address: Option<String>,
    pub subnet_mask: Option<String>,
    pub link_status_active: bool,

    // L1/L2 RF Metrics (Specific to Wi-Fi)
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    pub rssi_dbm: Option<i32>,
    pub noise_dbm: Option<i32>,
    pub snr_db: Option<i32>,
    pub channel: Option<u32>,
    pub channel_width_mhz: Option<u32>,
    pub channel_band: Option<String>, // "2.4GHz", "5GHz", "6GHz"
    pub phy_mode: Option<String>,     // "802.11ax", "802.11be", "802.11ac"
    pub standard_generation: Option<String>, // "Wi-Fi 6", "Wi-Fi 6E", "Wi-Fi 7", "Wi-Fi 5"
    pub tx_rate_mbps: Option<f64>,
    pub mcs_index: Option<u32>,

    // Gateway telemetry
    pub gateway_ip: Option<String>,
    pub gateway_mac: Option<String>,
    pub gateway_rtt_samples: Vec<f64>,
    pub gateway_rtt_avg_ms: Option<f64>,
    pub gateway_rtt_min_ms: Option<f64>,
    pub gateway_rtt_max_ms: Option<f64>,
    pub gateway_jitter_ms: Option<f64>,
    pub gateway_packet_loss_pct: f64,

    // Evaluated state
    pub signal_quality: SignalQualityRating,
    pub diagnosis_flags: Vec<String>,

    // Virtual Interface / TUN / VPN Detection & Physical Bypass
    #[serde(default)]
    pub is_tunnel_active: bool,
    #[serde(default)]
    pub tunnel_interface: Option<String>,
    #[serde(default)]
    pub tunnel_gateway: Option<String>,
    #[serde(default)]
    pub physical_interface: Option<String>,
    #[serde(default)]
    pub physical_gateway: Option<String>,
    #[serde(default)]
    pub is_physical_bypass_active: bool,
}

/// Stage 2: Office DNS & Proxy Topology (L3/L7)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsBenchmarkResult {
    pub resolver_name: String,
    pub resolver_ip: String,
    pub resolver_category: ResolverCategory,
    pub target_domain: String,
    pub resolved_ips: Vec<String>,
    pub latency_ms: Option<f64>,
    pub status: DnsStatus,
    pub is_system_default: bool,
    pub geo_mismatch: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyTopologyInfo {
    pub proxy_enabled: bool,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub socks_proxy: Option<String>,
    pub pac_url: Option<String>,
    pub bypass_list: Vec<String>,
}

/// Stage 3: WAN Backbone & Visual Hop-by-Hop MTR (L3/L4)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MtrHopResult {
    pub target_name: String,
    pub target_host: String,
    pub hop_number: u32,
    pub ip: Option<String>,
    pub hostname: Option<String>,
    pub asn: Option<String>,
    pub asn_org: Option<String>,
    pub geo: Option<String>,
    pub sent_count: u32,
    pub received_count: u32,
    pub loss_pct: f64,
    pub last_rtt_ms: Option<f64>,
    pub avg_rtt_ms: Option<f64>,
    pub best_rtt_ms: Option<f64>,
    pub worst_rtt_ms: Option<f64>,
    pub stddev_jitter_ms: Option<f64>,
    pub sparkline_samples: Vec<f64>,
    pub status: HopStatus,
    pub is_bottleneck: bool,
    pub anomaly_type: Option<String>,
    pub probe_protocol: Option<String>,
}

/// Stage 4: Bufferbloat & Loaded Latency (RPM Metric)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferbloatMetric {
    pub unloaded_latency_ms: f64,
    pub loaded_download_latency_ms: f64,
    pub loaded_upload_latency_ms: f64,
    pub bufferbloat_delta_ms: f64,
    pub rpm: u32,
    pub grade: String, // "A+", "A", "B", "C", "D", "F"
    pub download_bandwidth_mbps: Option<f64>,
    pub upload_bandwidth_mbps: Option<f64>,
}

/// Stage 5: Transport & TLS Performance Benchmark (L4/L7)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportTlsMetric {
    pub target: String,
    pub tcp_handshake_ms: f64,
    pub tls_handshake_ms: f64,
    pub ttfb_ms: f64,
    pub tls_version: String,
    pub cipher_suite: String,
    pub path_mtu: u32,
    pub pmtu_blackhole_detected: bool,
}

/// Root Cause Analysis Finding Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RcaFinding {
    pub stage: u32,
    pub severity: SeverityLevel,
    pub rule_id: String,
    pub message: String,
    pub metric_evidence: String,
}

/// Overall Diagnostic Summary & RCA Findings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticSummary {
    pub id: String,
    pub timestamp: String,
    pub overall_severity: SeverityLevel,
    pub primary_cause_category: RcaCategory,
    pub headline: String,
    pub detailed_explanation: String,
    pub actionable_recommendation: String,
    pub affected_stages: Vec<u32>,
    pub findings: Vec<RcaFinding>,
    pub export_markdown: String,
    pub export_json: String,
}

/// Unified Snapshot of all 5 Diagnostic Stages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteDiagnosticReport {
    pub stage1_link: WiFiInterfaceInfo,
    pub stage2_proxy: ProxyTopologyInfo,
    pub stage2_dns: Vec<DnsBenchmarkResult>,
    pub stage3_mtr: Vec<MtrHopResult>,
    pub stage4_bufferbloat: BufferbloatMetric,
    pub stage5_transport: TransportTlsMetric,
    pub summary: DiagnosticSummary,
}
