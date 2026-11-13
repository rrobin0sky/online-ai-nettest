export type SeverityLevel = 'NORMAL' | 'DEGRADED' | 'CRITICAL';

export type SignalQualityRating = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';

export type RcaCategory = 
  | 'LOCAL_WI_FI' 
  | 'LOCAL_GATEWAY' 
  | 'LOCAL_DNS' 
  | 'EGRESS_PROXY' 
  | 'DOMESTIC_ISP' 
  | 'BORDER_GATEWAY' 
  | 'TARGET_SERVER' 
  | 'BUFFERBLOAT' 
  | 'HEALTHY';

export type ResolverCategory = 'SYSTEM_LOCAL' | 'CHINA_PUBLIC' | 'GLOBAL_PUBLIC' | 'CUSTOM';

export type DnsStatus = 'SUCCESS' | 'TIMEOUT' | 'ERROR';

export type HopStatus = 'HEALTHY' | 'HIGH_LATENCY' | 'PACKET_LOSS' | 'UNRESPONSIVE';

export type HopAnomalyType = 'ICMP_RATE_LIMITED' | 'EDGE_FIREWALL_ICMP_DROP' | 'GENUINE_LOSS' | null;

/**
 * Stage 1: macOS Local Link & Wi-Fi Telemetry (L1/L2)
 */
export interface WiFiInterfaceInfo {
  interface_name: string;
  mac_address: string;
  interface_type: string; // "Wi-Fi", "Ethernet", etc.
  ip_address: string | null;
  subnet_mask: string | null;
  link_status_active: boolean;

  // L1/L2 RF Metrics
  ssid: string | null;
  bssid: string | null;
  rssi_dbm: number | null;
  noise_dbm: number | null;
  snr_db: number | null;
  channel: number | null;
  channel_width_mhz: number | null;
  channel_band: string | null; // "2.4GHz", "5GHz", "6GHz"
  phy_mode: string | null;     // "802.11ax", "802.11ac", etc.
  standard_generation: string | null; // "Wi-Fi 6", "Wi-Fi 7", etc.
  tx_rate_mbps: number | null;
  mcs_index: number | null;

  // Gateway discovery & ping jitter
  gateway_ip: string | null;
  gateway_mac: string | null;
  gateway_rtt_samples: number[];
  gateway_rtt_avg_ms: number | null;
  gateway_rtt_min_ms: number | null;
  gateway_rtt_max_ms: number | null;
  gateway_jitter_ms: number | null;
  gateway_packet_loss_pct: number;

  // Diagnosis
  signal_quality: SignalQualityRating;
  diagnosis_flags: string[];

  // Virtual Interface / TUN / VPN Detection & Physical Bypass
  is_tunnel_active?: boolean;
  tunnel_interface?: string | null;
  tunnel_gateway?: string | null;
  physical_interface?: string | null;
  physical_gateway?: string | null;
  is_physical_bypass_active?: boolean;
}

/**
 * Stage 2: Office DNS & Proxy Topology (L3/L7)
 */
export interface DnsBenchmarkResult {
  resolver_name: string;
  resolver_ip: string;
  resolver_category: ResolverCategory;
  target_domain: string;
  resolved_ips: string[];
  latency_ms: number | null;
  status: DnsStatus;
  is_system_default: boolean;
  geo_mismatch: boolean;
  error_message: string | null;
}

export interface ProxyTopologyInfo {
  proxy_enabled: boolean;
  http_proxy: string | null;
  https_proxy: string | null;
  socks_proxy: string | null;
  pac_url: string | null;
  bypass_list: string[];
}

/**
 * Stage 3: WAN Backbone & Visual Hop-by-Hop MTR (L3/L4)
 */
export interface MtrHopResult {
  target_name: string;
  target_host: string;
  hop_number: number;
  ip: string | null;
  hostname: string | null;
  asn: string | null;
  asn_org: string | null;
  geo: string | null;
  sent_count: number;
  received_count: number;
  loss_pct: number;
  last_rtt_ms: number | null;
  avg_rtt_ms: number | null;
  best_rtt_ms: number | null;
  worst_rtt_ms: number | null;
  stddev_jitter_ms: number | null;
  sparkline_samples: number[];
  status: HopStatus;
  is_bottleneck: boolean;
  anomaly_type?: HopAnomalyType;
  probe_protocol?: string;
}

/**
 * Stage 4: Bufferbloat & Loaded Latency (RPM Metric)
 */
export interface BufferbloatMetric {
  unloaded_latency_ms: number;
  loaded_download_latency_ms: number;
  loaded_upload_latency_ms: number;
  bufferbloat_delta_ms: number;
  rpm: number;
  grade: string; // "A+", "A", "B", "C", "D", "F"
  download_bandwidth_mbps: number | null;
  upload_bandwidth_mbps: number | null;
}

/**
 * Stage 5: Transport & TLS Performance Benchmark (L4/L7)
 */
export interface TransportTlsMetric {
  target: string;
  tcp_handshake_ms: number;
  tls_handshake_ms: number;
  ttfb_ms: number;
  tls_version: string;
  cipher_suite: string;
  path_mtu: number;
  pmtu_blackhole_detected: boolean;
}

/**
 * Root Cause Analysis Finding
 */
export interface RcaFinding {
  stage: number;
  severity: SeverityLevel;
  rule_id: string;
  message: string;
  metric_evidence: string;
}

/**
 * Diagnostic Summary
 */
export interface DiagnosticSummary {
  id: string;
  timestamp: string;
  overall_severity: SeverityLevel;
  primary_cause_category: RcaCategory;
  headline: string;
  detailed_explanation: string;
  actionable_recommendation: string;
  affected_stages: number[];
  findings: RcaFinding[];
  export_markdown: string;
  export_json: string;
}

/**
 * Complete Diagnostic Report
 */
export interface CompleteDiagnosticReport {
  stage1_link: WiFiInterfaceInfo;
  stage2_proxy: ProxyTopologyInfo;
  stage2_dns: DnsBenchmarkResult[];
  stage3_mtr: MtrHopResult[];
  stage4_bufferbloat: BufferbloatMetric;
  stage5_transport: TransportTlsMetric;
  summary: DiagnosticSummary;
}
