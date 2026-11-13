import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeMtrHops } from '../src-core/analyzer/mtrSanitizer.ts';
import { HierarchicalRcaEngine } from '../src-core/analyzer/rcaEngine.ts';
import type {
  WiFiInterfaceInfo,
  ProxyTopologyInfo,
  DnsBenchmarkResult,
  MtrHopResult,
  BufferbloatMetric,
  TransportTlsMetric,
} from '../src/types/telemetry.ts';

describe('Data-Plane First RCA Arbitration & CoPP Filter Tests', () => {
  const mockLink: WiFiInterfaceInfo = {
    interface_name: 'en0',
    interface_type: 'Wi-Fi',
    ssid: 'Enterprise-5G',
    bssid: 'aa:bb:cc:dd:ee:ff',
    rssi_dbm: -52,
    noise_dbm: -92,
    snr_db: 40,
    channel: 36,
    channel_width_mhz: 80,
    channel_band: '5GHz',
    phy_mode: '802.11ax',
    standard_generation: 'Wi-Fi 6',
    tx_rate_mbps: 1200,
    mcs_index: 11,
    gateway_ip: '192.168.1.1',
    gateway_mac: '00:11:22:33:44:55',
    gateway_rtt_avg_ms: 1.2,
    gateway_jitter_ms: 0.3,
    gateway_packet_loss_pct: 0.0,
    gateway_rtt_samples: [1.1, 1.2, 1.3],
    signal_quality: 'EXCELLENT',
    diagnosis_flags: [],
    link_status_active: true,
  };

  const mockProxy: ProxyTopologyInfo = {
    proxy_enabled: false,
    http_proxy: null,
    https_proxy: null,
    socks_proxy: null,
    pac_url: null,
    bypass_hosts: [],
  };

  const mockDns: DnsBenchmarkResult[] = [
    {
      resolver_name: 'System Local DNS',
      resolver_ip: '192.168.1.1',
      latency_ms: 9.0,
      status: 'SUCCESS',
      is_system_default: true,
      geo_mismatch: false,
      resolved_ips: ['203.0.113.10'],
    },
    {
      resolver_name: 'AliDNS Anycast',
      resolver_ip: '223.5.5.5',
      latency_ms: 12.0,
      status: 'SUCCESS',
      is_system_default: false,
      geo_mismatch: false,
      resolved_ips: ['203.0.113.10'],
    },
  ];

  const rawMtrHops: MtrHopResult[] = [
    {
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 1,
      ip: '192.168.1.1',
      hostname: 'gw.local',
      asn: 'LAN',
      asn_org: 'Local Gateway',
      geo: 'Office LAN',
      sent_count: 15,
      received_count: 15,
      loss_pct: 0.0,
      avg_rtt_ms: 1.2,
      best_rtt_ms: 1.0,
      worst_rtt_ms: 1.5,
      last_rtt_ms: 1.2,
      stddev_jitter_ms: 0.2,
      sparkline_samples: [1.1, 1.2, 1.3],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
    {
      // Hop 2 exhibits 66.7% ICMP loss due to router Control Plane Policing (CoPP)
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 2,
      ip: '100.64.0.1',
      hostname: 'peering.cgnat',
      asn: 'AS4134',
      asn_org: 'Carrier Peering Router',
      geo: 'Metropolitan Aggregation',
      sent_count: 15,
      received_count: 5,
      loss_pct: 66.7,
      avg_rtt_ms: 8.5,
      best_rtt_ms: 7.0,
      worst_rtt_ms: 10.0,
      last_rtt_ms: 8.5,
      stddev_jitter_ms: 0.8,
      sparkline_samples: [8.0, 9.0, 8.5],
      status: 'DEGRADED',
      is_bottleneck: false,
    },
    {
      // Hop 3 downstream responds with 0% loss, physically proving forwarding through Hop 2 was lossless
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 3,
      ip: '202.97.12.34',
      hostname: 'backbone-core.163.net',
      asn: 'AS4134',
      asn_org: 'National IP Backbone',
      geo: 'Shanghai, CN',
      sent_count: 15,
      received_count: 15,
      loss_pct: 0.0,
      avg_rtt_ms: 15.2,
      best_rtt_ms: 14.5,
      worst_rtt_ms: 16.0,
      last_rtt_ms: 15.2,
      stddev_jitter_ms: 0.5,
      sparkline_samples: [15.0, 15.2, 15.5],
      status: 'HEALTHY',
      is_bottleneck: false,
    },
    {
      // Trailing hops 4-6 drop ICMP ECHO (edge firewall protection)
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 4,
      ip: null,
      hostname: null,
      asn: null,
      asn_org: null,
      geo: null,
      sent_count: 15,
      received_count: 0,
      loss_pct: 100.0,
      avg_rtt_ms: null,
      best_rtt_ms: null,
      worst_rtt_ms: null,
      last_rtt_ms: null,
      stddev_jitter_ms: null,
      sparkline_samples: [],
      status: 'CRITICAL',
      is_bottleneck: false,
    },
    {
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 5,
      ip: null,
      hostname: null,
      asn: null,
      asn_org: null,
      geo: null,
      sent_count: 15,
      received_count: 0,
      loss_pct: 100.0,
      avg_rtt_ms: null,
      best_rtt_ms: null,
      worst_rtt_ms: null,
      last_rtt_ms: null,
      stddev_jitter_ms: null,
      sparkline_samples: [],
      status: 'CRITICAL',
      is_bottleneck: false,
    },
    {
      target_name: 'Production Core',
      target_host: '203.0.113.10',
      hop_number: 6,
      ip: null,
      hostname: null,
      asn: null,
      asn_org: null,
      geo: null,
      sent_count: 15,
      received_count: 0,
      loss_pct: 100.0,
      avg_rtt_ms: null,
      best_rtt_ms: null,
      worst_rtt_ms: null,
      last_rtt_ms: null,
      stddev_jitter_ms: null,
      sparkline_samples: [],
      status: 'CRITICAL',
      is_bottleneck: false,
    },
  ];

  const mockBufferbloat: BufferbloatMetric = {
    unloaded_latency_ms: 15.0,
    loaded_download_latency_ms: 22.0,
    loaded_upload_latency_ms: 27.0,
    bufferbloat_delta_ms: 12.0,
    rpm: 950,
    grade: 'A',
    download_bandwidth_mbps: 300.0,
    upload_bandwidth_mbps: 50.0,
  };

  const mockHealthyTransport: TransportTlsMetric = {
    target: '203.0.113.10',
    port: 443,
    tcp_handshake_ms: 35.0,
    tls_handshake_ms: 19.0,
    ttfb_ms: 61.6,
    tls_version: 'TLS 1.3',
    cipher_suite: 'TLS_AES_256_GCM_SHA384',
    path_mtu: 1500,
    pmtu_blackhole_detected: false,
  };

  test('Sanitizer correctly identifies CoPP ICMP rate limiting and edge firewall drop', () => {
    const sanitized = sanitizeMtrHops(rawMtrHops, { isDataPlaneHealthy: true });

    // Hop 2 must be classified as ICMP_RATE_LIMITED and NOT a bottleneck
    const hop2 = sanitized.find((h) => h.hop_number === 2)!;
    assert.equal(hop2.anomaly_type, 'ICMP_RATE_LIMITED');
    assert.equal(hop2.is_bottleneck, false);
    assert.equal(hop2.status, 'DEGRADED');

    // Hop 4, 5, 6 must be classified as EDGE_FIREWALL_ICMP_DROP
    const hop4 = sanitized.find((h) => h.hop_number === 4)!;
    const hop5 = sanitized.find((h) => h.hop_number === 5)!;
    const hop6 = sanitized.find((h) => h.hop_number === 6)!;
    assert.equal(hop4.anomaly_type, 'EDGE_FIREWALL_ICMP_DROP');
    assert.equal(hop5.anomaly_type, 'EDGE_FIREWALL_ICMP_DROP');
    assert.equal(hop6.anomaly_type, 'EDGE_FIREWALL_ICMP_DROP');
    assert.equal(hop6.is_bottleneck, false);
  });

  test('Hierarchical RCA Engine arbitrates Data-Plane First and prevents false-positive CRITICAL alerts', () => {
    const summary = HierarchicalRcaEngine.evaluate(
      mockLink,
      mockProxy,
      mockDns,
      rawMtrHops,
      mockBufferbloat,
      mockHealthyTransport
    );

    // Assert that healthy data-plane guarantees overall severity is NORMAL (no false positive CRITICAL)
    assert.equal(
      summary.overall_severity,
      'NORMAL',
      `Expected overall_severity to be NORMAL, got: ${summary.overall_severity}`
    );
    assert.equal(summary.primary_cause_category, 'HEALTHY');

    // Assert headline acknowledges data-plane verification and ICMP filtering
    assert.match(summary.headline, /Data-Plane Verified/i);

    // Assert findings contain informational CoPP and Edge firewall notes with NORMAL severity
    const coppFinding = summary.findings.find((f) => f.rule_id === 'RULE_MTR_COPP_FILTERED');
    assert.ok(coppFinding, 'Should contain RULE_MTR_COPP_FILTERED finding');
    assert.equal(coppFinding.severity, 'NORMAL');

    const edgeFinding = summary.findings.find((f) => f.rule_id === 'RULE_MTR_EDGE_FIREWALL_FILTERED');
    assert.ok(edgeFinding, 'Should contain RULE_MTR_EDGE_FIREWALL_FILTERED finding');
    assert.equal(edgeFinding.severity, 'NORMAL');

    // Assert that NO CRITICAL finding was generated for MTR
    const mtrCritical = summary.findings.find((f) => f.rule_id === 'RULE_MTR_BOTTLENECK');
    assert.equal(mtrCritical, undefined, 'RULE_MTR_BOTTLENECK must NOT be present when data-plane is healthy');
  });

  test('Impaired data-plane with genuine bottleneck correctly triggers CRITICAL', () => {
    // When downstream data-plane is impaired (e.g. TCP fails / > 250ms or times out)
    const impairedTransport: TransportTlsMetric = {
      ...mockHealthyTransport,
      tcp_handshake_ms: 320.0,
      ttfb_ms: 850.0,
    };

    const genuineLossMtr: MtrHopResult[] = [
      rawMtrHops[0],
      {
        ...rawMtrHops[1],
        loss_pct: 66.7,
      },
      {
        ...rawMtrHops[2],
        loss_pct: 75.0, // downstream also suffers sustained/higher loss
      },
      rawMtrHops[3],
    ];

    const summary = HierarchicalRcaEngine.evaluate(
      mockLink,
      mockProxy,
      mockDns,
      genuineLossMtr,
      mockBufferbloat,
      impairedTransport
    );

    assert.equal(summary.overall_severity, 'CRITICAL');
    assert.equal(summary.primary_cause_category, 'DOMESTIC_ISP');
    const bottleneckFinding = summary.findings.find((f) => f.rule_id === 'RULE_MTR_BOTTLENECK');
    assert.ok(bottleneckFinding, 'Should identify true bottleneck when data plane is impaired');
  });
});
