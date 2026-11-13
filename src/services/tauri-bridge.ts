import { invoke } from '@tauri-apps/api/core';
import {
  WiFiInterfaceInfo,
  ProxyTopologyInfo,
  DnsBenchmarkResult,
  MtrHopResult,
  BufferbloatMetric,
  TransportTlsMetric,
  CompleteDiagnosticReport,
} from '../types';

// Check if running inside Tauri desktop webview
export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

/**
 * Stage 1: macOS Local Link & Wi-Fi Telemetry
 */
export async function fetchStage1Link(bypassTunnel?: boolean): Promise<WiFiInterfaceInfo> {
  if (isTauriEnvironment()) {
    return await invoke<WiFiInterfaceInfo>('probe_stage1_link', {
      bypassTunnel: bypassTunnel ?? true,
    });
  }
  // Mock fallback for browser dev
  return {
    interface_name: 'en0',
    mac_address: '9c:58:84:31:22:4a',
    interface_type: 'Wi-Fi',
    ip_address: '172.20.10.4',
    subnet_mask: '255.255.255.240',
    link_status_active: true,
    ssid: "Robin's iPhone",
    bssid: '82:04:5f:e8:b8:64',
    rssi_dbm: -41,
    noise_dbm: -92,
    snr_db: 51,
    channel: 6,
    channel_width_mhz: 20,
    channel_band: '2GHz',
    phy_mode: '802.11ax',
    standard_generation: 'Wi-Fi 6',
    tx_rate_mbps: 78.0,
    mcs_index: 5,
    gateway_ip: '172.20.10.1',
    gateway_mac: '82:04:5f:e8:b8:64',
    gateway_rtt_samples: [5.2, 6.1, 4.8, 5.5, 7.2, 5.0, 5.3, 6.8, 8.1, 5.4],
    gateway_rtt_avg_ms: 5.94,
    gateway_rtt_min_ms: 4.8,
    gateway_rtt_max_ms: 8.1,
    gateway_jitter_ms: 1.05,
    gateway_packet_loss_pct: 0.0,
    signal_quality: 'EXCELLENT',
    diagnosis_flags: ['[INFO: TUN/VPN Active (utun4) | Physical Bypass: en0 -> 172.20.10.1]'],
    is_tunnel_active: true,
    tunnel_interface: 'utun4',
    tunnel_gateway: '198.18.0.1',
    physical_interface: 'en0',
    physical_gateway: '172.20.10.1',
    is_physical_bypass_active: bypassTunnel ?? true,
  };
}

/**
 * Stage 2: System Proxy Topology
 */
export async function fetchStage2Proxy(): Promise<ProxyTopologyInfo> {
  if (isTauriEnvironment()) {
    return await invoke<ProxyTopologyInfo>('probe_stage2_proxy');
  }
  return {
    proxy_enabled: true,
    http_proxy: '127.0.0.1:7897',
    https_proxy: '127.0.0.1:7897',
    socks_proxy: '127.0.0.1:7897',
    pac_url: null,
    bypass_list: ['127.0.0.1', '192.168.0.0/16', '10.0.0.0/8', 'localhost', '*.local'],
  };
}

/**
 * Stage 2: Multi-Resolver DNS Benchmark
 */
export async function fetchStage2Dns(domain?: string): Promise<DnsBenchmarkResult[]> {
  if (isTauriEnvironment()) {
    return await invoke<DnsBenchmarkResult[]>('probe_stage2_dns', { domain });
  }
  return [
    {
      resolver_name: 'System Local DNS (DHCP)',
      resolver_ip: '114.114.114.114',
      resolver_category: 'SYSTEM_LOCAL',
      target_domain: domain || 'www.aliyun.com',
      resolved_ips: ['223.5.5.5', '140.205.94.189'],
      latency_ms: 14.2,
      status: 'SUCCESS',
      is_system_default: true,
      geo_mismatch: false,
      error_message: null,
    },
    {
      resolver_name: 'AliDNS (Alibaba Cloud)',
      resolver_ip: '223.5.5.5',
      resolver_category: 'CHINA_PUBLIC',
      target_domain: domain || 'www.aliyun.com',
      resolved_ips: ['140.205.94.189'],
      latency_ms: 12.8,
      status: 'SUCCESS',
      is_system_default: false,
      geo_mismatch: false,
      error_message: null,
    },
    {
      resolver_name: 'DNSPod (Tencent Cloud)',
      resolver_ip: '119.29.29.29',
      resolver_category: 'CHINA_PUBLIC',
      target_domain: domain || 'www.aliyun.com',
      resolved_ips: ['140.205.94.189'],
      latency_ms: 15.1,
      status: 'SUCCESS',
      is_system_default: false,
      geo_mismatch: false,
      error_message: null,
    },
    {
      resolver_name: 'Cloudflare Public DNS',
      resolver_ip: '1.1.1.1',
      resolver_category: 'GLOBAL_PUBLIC',
      target_domain: domain || 'www.aliyun.com',
      resolved_ips: ['140.205.94.189'],
      latency_ms: 38.6,
      status: 'SUCCESS',
      is_system_default: false,
      geo_mismatch: false,
      error_message: null,
    },
    {
      resolver_name: 'Google Public DNS',
      resolver_ip: '8.8.8.8',
      resolver_category: 'GLOBAL_PUBLIC',
      target_domain: domain || 'www.aliyun.com',
      resolved_ips: ['140.205.94.189'],
      latency_ms: 45.3,
      status: 'SUCCESS',
      is_system_default: false,
      geo_mismatch: false,
      error_message: null,
    },
  ];
}

/**
 * Stage 3: WAN Backbone MTR
 */
export async function fetchStage3Mtr(
  targetName?: string,
  targetHost?: string,
  protocol?: string
): Promise<MtrHopResult[]> {
  if (isTauriEnvironment()) {
    return await invoke<MtrHopResult[]>('probe_stage3_mtr', {
      targetName,
      targetHost,
      protocol: protocol || 'ICMP',
    });
  }
  return [
    {
      target_name: targetName || 'AliCloud East (BGP)',
      target_host: targetHost || '223.5.5.5',
      hop_number: 1,
      ip: '172.20.10.1',
      hostname: 'gateway.local',
      asn: 'LAN',
      asn_org: 'Local Subnet Gateway',
      geo: 'Local LAN',
      sent_count: 3,
      received_count: 3,
      loss_pct: 0.0,
      last_rtt_ms: 5.2,
      avg_rtt_ms: 5.1,
      best_rtt_ms: 4.8,
      worst_rtt_ms: 5.5,
      stddev_jitter_ms: 0.3,
      sparkline_samples: [4.8, 5.1, 5.5],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
    {
      target_name: targetName || 'AliCloud East (BGP)',
      target_host: targetHost || '223.5.5.5',
      hop_number: 2,
      ip: '100.64.0.1',
      hostname: null,
      asn: 'CGNAT',
      asn_org: 'Carrier Grade NAT Access',
      geo: 'Metropolitan Aggregation',
      sent_count: 3,
      received_count: 3,
      loss_pct: 0.0,
      last_rtt_ms: 11.2,
      avg_rtt_ms: 10.9,
      best_rtt_ms: 9.8,
      worst_rtt_ms: 12.1,
      stddev_jitter_ms: 0.9,
      sparkline_samples: [9.8, 10.9, 12.1],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
    {
      target_name: targetName || 'AliCloud East (BGP)',
      target_host: targetHost || '223.5.5.5',
      hop_number: 3,
      ip: '202.97.42.17',
      hostname: 'bj-core-peering.163.net',
      asn: 'AS4134',
      asn_org: 'China Telecom 163 Backbone',
      geo: 'Beijing, CN',
      sent_count: 3,
      received_count: 3,
      loss_pct: 0.0,
      last_rtt_ms: 18.5,
      avg_rtt_ms: 19.1,
      best_rtt_ms: 17.8,
      worst_rtt_ms: 21.0,
      stddev_jitter_ms: 1.3,
      sparkline_samples: [17.8, 18.5, 21.0],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
    {
      target_name: targetName || 'AliCloud East (BGP)',
      target_host: targetHost || '223.5.5.5',
      hop_number: 4,
      ip: '223.5.5.5',
      hostname: 'public1.alidns.com',
      asn: 'AS37963',
      asn_org: 'Alibaba Cloud BGP Anycast',
      geo: 'Hangzhou, CN',
      sent_count: 3,
      received_count: 3,
      loss_pct: 0.0,
      last_rtt_ms: 14.8,
      avg_rtt_ms: 14.9,
      best_rtt_ms: 14.2,
      worst_rtt_ms: 15.6,
      stddev_jitter_ms: 0.6,
      sparkline_samples: [14.2, 14.8, 15.6],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
  ];
}

/**
 * Stage 4: Bufferbloat & Loaded Latency
 */
export async function fetchStage4Bufferbloat(): Promise<BufferbloatMetric> {
  if (isTauriEnvironment()) {
    return await invoke<BufferbloatMetric>('probe_stage4_bufferbloat');
  }
  return {
    unloaded_latency_ms: 14.8,
    loaded_download_latency_ms: 22.4,
    loaded_upload_latency_ms: 28.1,
    bufferbloat_delta_ms: 13.3,
    rpm: 1420,
    grade: 'A',
    download_bandwidth_mbps: 248.5,
    upload_bandwidth_mbps: 52.8,
  };
}

/**
 * Stage 5: Transport & TLS Performance
 */
export async function fetchStage5Transport(targetHost?: string, targetPort?: number): Promise<TransportTlsMetric> {
  if (isTauriEnvironment()) {
    return await invoke<TransportTlsMetric>('probe_stage5_transport', {
      targetHost,
      targetPort,
    });
  }
  return {
    target: targetHost || 'www.aliyun.com',
    tcp_handshake_ms: 14.5,
    tls_handshake_ms: 28.2,
    ttfb_ms: 54.1,
    tls_version: 'TLSv1.3',
    cipher_suite: 'TLS_AES_128_GCM_SHA256',
    path_mtu: 1500,
    pmtu_blackhole_detected: false,
  };
}

/**
 * Run All 5 Stages Simultaneously & Generate Deterministic RCA
 */
export async function runFullDiagnosticPipeline(
  targetDomain?: string,
  targetHost?: string,
  bypassTunnel?: boolean
): Promise<CompleteDiagnosticReport> {
  if (isTauriEnvironment()) {
    return await invoke<CompleteDiagnosticReport>('run_full_pipeline', {
      targetDomain,
      targetHost,
      bypassTunnel: bypassTunnel ?? true,
    });
  }

  // Synthesize complete report for web fallback
  const link = await fetchStage1Link(bypassTunnel);
  const proxy = await fetchStage2Proxy();
  const dns = await fetchStage2Dns(targetDomain);
  const mtr = await fetchStage3Mtr('Target Backbone', targetHost);
  const bufferbloat = await fetchStage4Bufferbloat();
  const transport = await fetchStage5Transport(targetDomain, 443);

  return {
    stage1_link: link,
    stage2_proxy: proxy,
    stage2_dns: dns,
    stage3_mtr: mtr,
    stage4_bufferbloat: bufferbloat,
    stage5_transport: transport,
    summary: {
      id: `RCA-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      overall_severity: 'NORMAL',
      primary_cause_category: 'HEALTHY',
      headline: 'Optimal End-to-End Enterprise Connectivity',
      detailed_explanation:
        'All 5 diagnostic layers (L1 Wi-Fi, L2 Gateway, L3 DNS/MTR, L4 Bufferbloat, L7 TLS) meet or exceed enterprise SLAs.',
      actionable_recommendation: 'No immediate action required. Telemetry baseline verified.',
      affected_stages: [],
      findings: [
        {
          stage: 2,
          severity: 'NORMAL',
          rule_id: 'RULE_PROXY_ACTIVE',
          message: 'System Proxy In Use',
          metric_evidence: 'Active Proxies: HTTP: 127.0.0.1:7897, SOCKS: 127.0.0.1:7897',
        },
      ],
      export_markdown: '# NetPath-Lens Pro Diagnostic Report...',
      export_json: '{}',
    },
  };
}

/**
 * Sentinel API: Get buffer stats
 */
export async function getSentinelStats(): Promise<import('../types/sentinel').SentinelBufferStats> {
  if (isTauriEnvironment()) {
    return await invoke<import('../types/sentinel').SentinelBufferStats>('get_sentinel_stats');
  }
  return {
    sample_count: 30,
    capacity: 150,
    latest_gateway_rtt: 12.4,
    latest_anycast_rtt: 25.1,
    rolling_median_rtt_1m: 11.8,
    rolling_jitter_1m: 1.2,
    loss_rate_1m: 0.0,
    current_bssid: '82:04:5f:e8:b8:64',
    current_ssid: "Robin's Office 5G",
    current_rssi: -42,
  };
}

/**
 * Sentinel API: Get buffer samples
 */
export async function getSentinelBufferSamples(
  count?: number
): Promise<import('../types/sentinel').SentinelSample[]> {
  if (isTauriEnvironment()) {
    return await invoke<import('../types/sentinel').SentinelSample[]>('get_sentinel_buffer_samples', {
      count,
    });
  }
  return [];
}

/**
 * Sentinel API: Toggle running state
 */
export async function toggleSentinelState(enable?: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    return await invoke<boolean>('toggle_sentinel_state', { enable });
  }
  return enable ?? true;
}

/**
 * Sentinel API: Manually trigger an incident snapshot
 */
export async function triggerManualIncident(): Promise<import('../types/sentinel').IncidentReport> {
  if (isTauriEnvironment()) {
    return await invoke<import('../types/sentinel').IncidentReport>('trigger_manual_incident');
  }
  return {
    id: `inc_manual_${Date.now()}`,
    timestamp: Date.now(),
    trigger_reason: 'MANUAL',
    trigger_description: '手动触发哨兵黑匣子快照',
    metrics_at_trigger: {
      gateway_rtt: 12.4,
      anycast_rtt: 25.1,
      rolling_median_rtt: 11.8,
      rolling_jitter: 1.2,
      loss_rate_pct: 0.0,
      bssid: '82:04:5f:e8:b8:64',
      ssid: "Robin's Office 5G",
      rssi: -42,
      distinct_bssids_last_60s: ['82:04:5f:e8:b8:64'],
    },
    frozen_samples: [],
  };
}

/**
 * Ollama API: Probe local Ollama with system proxy bypass
 */
export async function probeOllama(
  baseUrl?: string
): Promise<import('../types/sentinel').OllamaStatus> {
  if (isTauriEnvironment()) {
    return await invoke<import('../types/sentinel').OllamaStatus>('probe_ollama', { baseUrl });
  }
  // Browser fallback probe
  const targetUrl = baseUrl || 'http://127.0.0.1:11434';
  const cleanUrl = targetUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${cleanUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map((m: any) => m.name || m.model);
      return {
        is_online: true,
        base_url: `${cleanUrl}/v1`,
        models,
        default_model: models[0] || null,
        message: `Ollama 在线，检测到 ${models.length} 个本地模型`,
      };
    }
  } catch {}
  return {
    is_online: false,
    base_url: `${cleanUrl}/v1`,
    models: [],
    default_model: null,
    message: '本地 Ollama 未启动 (1.5s 超时)',
  };
}
