import { CompleteDiagnosticReport } from '../types';
import type { BaselineDiffResult } from './baselineDiff';

/**
 * Anonymize IP address (mask last octet for public IPs)
 */
function maskIp(ip: string | null | undefined, anonymize: boolean): string {
  if (!ip) return 'N/A';
  if (!anonymize) return ip;

  // Private RFC1918 / Loopback / CGNAT
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('127.') ||
    ip.startsWith('100.64.')
  ) {
    return `${ip.split('.').slice(0, 2).join('.')}.x.x (LAN/CGNAT)`;
  }

  // Public IP: mask last two octets
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip;
}

/**
 * Anonymize MAC / BSSID
 */
function maskMac(mac: string | null | undefined, anonymize: boolean): string {
  if (!mac) return 'N/A';
  if (!anonymize) return mac;
  const parts = mac.split(':');
  if (parts.length === 6) {
    return `${parts[0]}:${parts[1]}:${parts[2]}:**:**:**`;
  }
  return 'xx:xx:xx:xx:xx:xx';
}

/**
 * Format and sanitize the 5-layer diagnostic telemetry report into token-dense YAML
 */
export function formatTelemetryForAI(
  report: CompleteDiagnosticReport,
  anonymize: boolean = true,
  baselineDiff?: BaselineDiffResult | null
): string {
  const { stage1_link, stage2_proxy, stage2_dns, stage3_mtr, stage4_bufferbloat, stage5_transport, summary } = report;

  // L1/L2 Wi-Fi / Physical
  const linkSection = `
LAYER_1_2_LOCAL_LINK:
  interface: "${stage1_link.interface_name} (${stage1_link.interface_type})"
  link_status: "${stage1_link.link_status_active ? 'ACTIVE_UP' : 'DOWN'}"
  tunnel_bypass_topology:
    is_tunnel_active: ${stage1_link.is_tunnel_active ?? false}
    tunnel_interface: "${stage1_link.tunnel_interface || 'NONE'}"
    physical_interface: "${stage1_link.physical_interface || stage1_link.interface_name}"
    physical_gateway: "${maskIp(stage1_link.physical_gateway || stage1_link.gateway_ip, anonymize)}"
    is_physical_bypass_active: ${stage1_link.is_physical_bypass_active ?? false}
  wifi_standard: "${stage1_link.standard_generation || 'Wi-Fi 6'} (${stage1_link.phy_mode || '802.11ax'})"
  channel: "CH ${stage1_link.channel ?? 'N/A'} (${stage1_link.channel_band || '2.4G'}, ${stage1_link.channel_width_mhz ?? 20}MHz)"
  ssid: "${anonymize ? '[Internal_WLAN_Encrypted]' : stage1_link.ssid || 'Unknown'}"
  bssid: "${maskMac(stage1_link.bssid, anonymize)}"
  rf_metrics:
    rssi_dbm: ${stage1_link.rssi_dbm ?? -90}
    noise_dbm: ${stage1_link.noise_dbm ?? -95}
    snr_db: ${stage1_link.snr_db ?? 0}
    mcs_index: ${stage1_link.mcs_index ?? 'N/A'}
    tx_rate_mbps: ${stage1_link.tx_rate_mbps ?? 'N/A'}
  gateway:
    ip: "${maskIp(stage1_link.gateway_ip, anonymize)}"
    mac: "${maskMac(stage1_link.gateway_mac, anonymize)}"
    rtt_avg_ms: ${stage1_link.gateway_rtt_avg_ms ?? 'N/A'}
    jitter_ms: ${stage1_link.gateway_jitter_ms ?? 'N/A'}
    packet_loss_pct: ${stage1_link.gateway_packet_loss_pct}
    samples_10pkts: [${stage1_link.gateway_rtt_samples.join(', ')}]
  quality_rating: "${stage1_link.signal_quality}"
  flags: [${stage1_link.diagnosis_flags.map((f) => `"${f}"`).join(', ')}]
`.trim();

  // L3/L7 DNS & Proxy
  const sysDns = stage2_dns.find((d) => d.is_system_default);
  const pubDns = stage2_dns.filter((d) => !d.is_system_default && d.status === 'SUCCESS');
  const minPubLatency = pubDns.length > 0 ? Math.min(...pubDns.map((d) => d.latency_ms ?? 999)) : null;

  const dnsSection = `
LAYER_3_7_DNS_AND_PROXY:
  proxy:
    enabled: ${stage2_proxy.proxy_enabled}
    http_proxy: "${stage2_proxy.http_proxy ? (anonymize ? '127.0.0.1:****' : stage2_proxy.http_proxy) : 'NONE'}"
    socks_proxy: "${stage2_proxy.socks_proxy ? (anonymize ? '127.0.0.1:****' : stage2_proxy.socks_proxy) : 'NONE'}"
  resolvers:
    system_local:
      ip: "${maskIp(sysDns?.resolver_ip, anonymize)}"
      latency_ms: ${sysDns?.latency_ms ?? 'TIMEOUT'}
      status: "${sysDns?.status || 'ERROR'}"
      geo_mismatch_detected: ${sysDns?.geo_mismatch || false}
    public_dns_fastest_latency_ms: ${minPubLatency ?? 'N/A'}
    delta_local_vs_public_ms: ${
      sysDns?.latency_ms && minPubLatency ? (sysDns.latency_ms - minPubLatency).toFixed(1) : 'N/A'
    }
    all_benchmarks:
${stage2_dns
  .map(
    (d) =>
      `      - name: "${d.resolver_name}"\n        ip: "${d.resolver_ip}"\n        latency_ms: ${d.latency_ms ?? 'TIMEOUT'}\n        status: "${d.status}"`
  )
  .join('\n')}
`.trim();

  // L3/L4 MTR: Filter to highlight anomalous hops and destination
  const anomalyHops = stage3_mtr.filter((h) => h.loss_pct > 0 || (h.avg_rtt_ms && h.avg_rtt_ms > 80) || h.is_bottleneck);
  const totalHops = stage3_mtr.length;
  const lastHop = stage3_mtr[stage3_mtr.length - 1];

  const mtrSection = `
LAYER_3_4_MTR_BACKBONE:
  target_host: "${maskIp(lastHop?.target_host, anonymize)}"
  total_hops_measured: ${totalHops}
  destination_reachable: ${lastHop && lastHop.received_count > 0}
  destination_avg_rtt_ms: ${lastHop?.avg_rtt_ms ?? 'TIMEOUT'}
  anomaly_or_peering_hops:
${
  anomalyHops.length === 0
    ? '    - note: "All hops healthy with 0% loss and steady latency"'
    : anomalyHops
        .map(
          (h) => `    - hop_${h.hop_number}:
        ip: "${maskIp(h.ip, anonymize)}"
        asn: "${h.asn || 'Unknown'}"
        org: "${h.asn_org || 'Transit Hop'}"
        location: "${h.geo || 'Unknown'}"
        loss_pct: ${h.loss_pct}%
        avg_rtt_ms: ${h.avg_rtt_ms ?? 'TIMEOUT'}
        jitter_ms: ${h.stddev_jitter_ms ?? 'N/A'}
        probe_protocol: "${h.probe_protocol || 'ICMP'}"
        anomaly_type: "${h.anomaly_type || 'NONE'}"
        is_isolated_bottleneck: ${h.is_bottleneck}`
        )
        .join('\n')
}
`.trim();

  // L4 Bufferbloat & Loaded Latency
  const bufferbloatSection = `
LAYER_4_BUFFERBLOAT_RPM:
  unloaded_baseline_rtt_ms: ${stage4_bufferbloat.unloaded_latency_ms}
  loaded_download_rtt_ms: ${stage4_bufferbloat.loaded_download_latency_ms}
  loaded_upload_rtt_ms: ${stage4_bufferbloat.loaded_upload_latency_ms}
  bufferbloat_delta_ms: +${stage4_bufferbloat.bufferbloat_delta_ms}
  apple_responsiveness_rpm: ${stage4_bufferbloat.rpm}
  bufferbloat_grade: "${stage4_bufferbloat.grade}"
  bandwidth_throughput:
    download_mbps: ${stage4_bufferbloat.download_bandwidth_mbps ?? 'N/A'}
    upload_mbps: ${stage4_bufferbloat.upload_bandwidth_mbps ?? 'N/A'}
`.trim();

  // L4/L7 Transport & TLS
  const transportSection = `
LAYER_4_7_TRANSPORT_AND_TLS:
  target: "${maskIp(stage5_transport.target, anonymize)}"
  tcp_3way_handshake_ms: ${stage5_transport.tcp_handshake_ms}
  tls_handshake_ms: ${stage5_transport.tls_handshake_ms}
  ttfb_ms: ${stage5_transport.ttfb_ms}
  tls_protocol: "${stage5_transport.tls_version} (${stage5_transport.cipher_suite})"
  path_mtu: ${stage5_transport.path_mtu}
  pmtu_blackhole_detected: ${stage5_transport.pmtu_blackhole_detected}
`.trim();

  // Rule findings from deterministic engine
  const findingsSection = `
DETERMINISTIC_RULES_EVALUATION:
  overall_severity: "${summary.overall_severity}"
  primary_suspected_domain: "${summary.primary_cause_category}"
  headline: "${summary.headline}"
  triggered_findings:
${
  summary.findings.length === 0
    ? '    - "None: Telemetry meets standard enterprise SLAs"'
    : summary.findings
        .map((f) => `    - [Stage ${f.stage}] [${f.severity}] ${f.message} (Rule: ${f.rule_id}) -> ${f.metric_evidence}`)
        .join('\n')
}
`.trim();

  // Optional Golden Baseline Diff Section
  let baselineDiffSection = '';
  if (baselineDiff) {
    baselineDiffSection = `
BASELINE_DIFF_SUMMARY:
  baseline_label: "${baselineDiff.baselineLabel}"
  baseline_pinned_at: "${new Date(baselineDiff.baselineTimestamp).toISOString()}"
  overall_diff_status: "${baselineDiff.overallHealthStatus}"
  summary_headline: "${baselineDiff.summaryHeadline}"
  kpi_deltas:
    gateway_rtt_delta: ${baselineDiff.kpis.gatewayRtt.formattedDelta} (Severity: ${baselineDiff.kpis.gatewayRtt.severity})
    gateway_jitter_delta: ${baselineDiff.kpis.gatewayJitter.formattedDelta}
    local_dns_delta: ${baselineDiff.kpis.dnsLatency.formattedDelta}
    bufferbloat_delta: ${baselineDiff.kpis.bufferbloatDelta.formattedDelta} (Grade: ${baselineDiff.kpis.bufferbloatGradeShift.baseline} -> ${baselineDiff.kpis.bufferbloatGradeShift.current})
    tcp_handshake_delta: ${baselineDiff.kpis.tcpHandshake.formattedDelta}
    ttfb_delta: ${baselineDiff.kpis.ttfb.formattedDelta}
  topology_diff:
    hop_count_delta: ${baselineDiff.topology.hopCountDelta > 0 ? '+' : ''}${baselineDiff.topology.hopCountDelta} (Baseline: ${baselineDiff.topology.baselineHopCount} hops, Current: ${baselineDiff.topology.currentHopCount} hops)
    asn_route_shift_detected: ${baselineDiff.topology.asnDiff.isRouteShiftDetected}
    baseline_asn_path: [${baselineDiff.topology.asnDiff.baselineAsnPath.map((a) => `"${a}"`).join(', ')}]
    current_asn_path: [${baselineDiff.topology.asnDiff.currentAsnPath.map((a) => `"${a}"`).join(', ')}]
    route_shift_explanation: "${baselineDiff.topology.asnDiff.shiftExplanation || 'None: Routing path stable'}"
    new_high_latency_hops: [${baselineDiff.topology.newHighLatencyHops.map((h) => `Hop #${h}`).join(', ')}]
`.trim();
  }

  return `
# NETPATH-LENS PRO TELEMETRY PAYLOAD
# Generated: ${new Date().toISOString()}
# Anonymized: ${anonymize}

${linkSection}

${dnsSection}

${mtrSection}

${bufferbloatSection}

${transportSection}

${findingsSection}
${baselineDiffSection ? `\n${baselineDiffSection}\n` : ''}
`.trim();
}
