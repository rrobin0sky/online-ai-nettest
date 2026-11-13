import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAsnPath,
  compareAsnPaths,
  computeBaselineDiff,
} from '../src-core/analyzer/computeBaselineDiff.ts';
import {
  isVirtualTunnelInterface,
  resolveInterfaceState,
} from '../src-core/probes/interfaceResolver.ts';
import type {
  CompleteDiagnosticReport,
  MtrHopResult,
} from '../src/types/telemetry.ts';

describe('macOS Virtual Interface (TUN/VPN) Detection Tests', () => {
  test('Correctly identifies virtual tunnel interface names', () => {
    assert.equal(isVirtualTunnelInterface('utun0'), true);
    assert.equal(isVirtualTunnelInterface('utun4'), true);
    assert.equal(isVirtualTunnelInterface('ppp0'), true);
    assert.equal(isVirtualTunnelInterface('ipsec3'), true);
    assert.equal(isVirtualTunnelInterface('wg0'), true);

    assert.equal(isVirtualTunnelInterface('en0'), false);
    assert.equal(isVirtualTunnelInterface('en1'), false);
    assert.equal(isVirtualTunnelInterface('bridge0'), false);
    assert.equal(isVirtualTunnelInterface('lo0'), false);
    assert.equal(isVirtualTunnelInterface(null), false);
  });

  test('Resolves tunnel vs physical interface state with bypass active', () => {
    const topo = resolveInterfaceState({
      interface_name: 'utun4',
      gateway_ip: '198.18.0.1',
      is_tunnel_active: true,
      tunnel_interface: 'utun4',
      tunnel_gateway: '198.18.0.1',
      physical_interface: 'en0',
      physical_gateway: '172.20.10.1',
      is_physical_bypass_active: true,
    });

    assert.equal(topo.isTunnelActive, true);
    assert.equal(topo.tunnelInterface, 'utun4');
    assert.equal(topo.physicalInterface, 'en0');
    assert.equal(topo.physicalGateway, '172.20.10.1');
    assert.equal(topo.isPhysicalBypassActive, true);
  });
});

describe('Golden Baseline & Diff Engine Tests', () => {
  test('extractAsnPath extracts unique ordered ASNs and removes private LAN / duplicates', () => {
    const mockHops: MtrHopResult[] = [
      {
        target_name: 'Target',
        target_host: '1.1.1.1',
        hop_number: 1,
        ip: '192.168.1.1',
        hostname: null,
        asn: 'LAN',
        asn_org: 'LAN',
        geo: null,
        sent_count: 10,
        received_count: 10,
        loss_pct: 0,
        avg_rtt_ms: 1.0,
        best_rtt_ms: 1.0,
        worst_rtt_ms: 1.0,
        last_rtt_ms: 1.0,
        stddev_jitter_ms: 0.1,
        sparkline_samples: [],
        status: 'HEALTHY',
        is_bottleneck: false,
      },
      {
        target_name: 'Target',
        target_host: '1.1.1.1',
        hop_number: 2,
        ip: '202.97.1.1',
        hostname: null,
        asn: 'AS4134',
        asn_org: 'China Telecom',
        geo: null,
        sent_count: 10,
        received_count: 10,
        loss_pct: 0,
        avg_rtt_ms: 12.0,
        best_rtt_ms: 12.0,
        worst_rtt_ms: 12.0,
        last_rtt_ms: 12.0,
        stddev_jitter_ms: 0.5,
        sparkline_samples: [],
        status: 'HEALTHY',
        is_bottleneck: false,
      },
      {
        target_name: 'Target',
        target_host: '1.1.1.1',
        hop_number: 3,
        ip: '202.97.1.2',
        hostname: null,
        asn: 'AS4134', // Consecutive duplicate
        asn_org: 'China Telecom',
        geo: null,
        sent_count: 10,
        received_count: 10,
        loss_pct: 0,
        avg_rtt_ms: 14.0,
        best_rtt_ms: 14.0,
        worst_rtt_ms: 14.0,
        last_rtt_ms: 14.0,
        stddev_jitter_ms: 0.4,
        sparkline_samples: [],
        status: 'HEALTHY',
        is_bottleneck: false,
      },
      {
        target_name: 'Target',
        target_host: '1.1.1.1',
        hop_number: 4,
        ip: '59.43.1.1',
        hostname: null,
        asn: 'AS4809',
        asn_org: 'China Telecom CN2',
        geo: null,
        sent_count: 10,
        received_count: 10,
        loss_pct: 0,
        avg_rtt_ms: 25.0,
        best_rtt_ms: 25.0,
        worst_rtt_ms: 25.0,
        last_rtt_ms: 25.0,
        stddev_jitter_ms: 0.3,
        sparkline_samples: [],
        status: 'HEALTHY',
        is_bottleneck: false,
      },
      {
        target_name: 'Target',
        target_host: '1.1.1.1',
        hop_number: 5,
        ip: '133.130.1.1',
        hostname: null,
        asn: 'AS45102',
        asn_org: 'Alibaba BGP',
        geo: null,
        sent_count: 10,
        received_count: 10,
        loss_pct: 0,
        avg_rtt_ms: 32.0,
        best_rtt_ms: 32.0,
        worst_rtt_ms: 32.0,
        last_rtt_ms: 32.0,
        stddev_jitter_ms: 0.2,
        sparkline_samples: [],
        status: 'HEALTHY',
        is_bottleneck: false,
      },
    ];

    const path = extractAsnPath(mockHops);
    assert.deepEqual(path, ['AS4134', 'AS4809', 'AS45102']);
  });

  test('compareAsnPaths flags route shift when traffic detours to different ASNs', () => {
    const baselinePath = ['AS4134', 'AS4809', 'AS45102']; // Premium CN2 path
    const currentDetourPath = ['AS4134', 'AS9929', 'AS45102']; // Detoured via CUII

    const diff = compareAsnPaths(baselinePath, currentDetourPath);
    assert.equal(diff.isRouteShiftDetected, true);
    assert.deepEqual(diff.newAsns, ['AS9929']);
    assert.deepEqual(diff.removedAsns, ['AS4809']);
    assert.match(diff.shiftExplanation!, /ASN Detour/i);
  });

  test('computeBaselineDiff computes KPI deltas and flags regressions', () => {
    const mockBaselineReport: CompleteDiagnosticReport = {
      stage1_link: {
        interface_name: 'en0',
        mac_address: '00:11:22:33:44:55',
        interface_type: 'Wi-Fi',
        ip_address: '192.168.1.100',
        subnet_mask: '255.255.255.0',
        link_status_active: true,
        ssid: 'Office-WiFi',
        bssid: 'aa:bb:cc:dd:ee:ff',
        rssi_dbm: -50,
        noise_dbm: -92,
        snr_db: 42,
        channel: 36,
        channel_width_mhz: 80,
        channel_band: '5GHz',
        phy_mode: '802.11ax',
        standard_generation: 'Wi-Fi 6',
        tx_rate_mbps: 1200,
        mcs_index: 11,
        gateway_ip: '192.168.1.1',
        gateway_mac: '11:22:33:44:55:66',
        gateway_rtt_samples: [2.1, 2.3],
        gateway_rtt_avg_ms: 2.2,
        gateway_rtt_min_ms: 2.0,
        gateway_rtt_max_ms: 2.5,
        gateway_jitter_ms: 0.3,
        gateway_packet_loss_pct: 0.0,
        signal_quality: 'EXCELLENT',
        diagnosis_flags: [],
      },
      stage2_proxy: {
        proxy_enabled: false,
        http_proxy: null,
        https_proxy: null,
        socks_proxy: null,
        pac_url: null,
        bypass_hosts: [],
      },
      stage2_dns: [
        {
          resolver_name: 'System Local DNS',
          resolver_ip: '192.168.1.1',
          latency_ms: 8.0,
          status: 'SUCCESS',
          is_system_default: true,
          geo_mismatch: false,
          resolved_ips: ['223.5.5.5'],
        },
      ],
      stage3_mtr: [
        {
          target_name: 'Core Target',
          target_host: '223.5.5.5',
          hop_number: 1,
          ip: '192.168.1.1',
          hostname: null,
          asn: 'LAN',
          asn_org: null,
          geo: null,
          sent_count: 10,
          received_count: 10,
          loss_pct: 0,
          avg_rtt_ms: 2.2,
          best_rtt_ms: 2.0,
          worst_rtt_ms: 2.5,
          last_rtt_ms: 2.2,
          stddev_jitter_ms: 0.3,
          sparkline_samples: [],
          status: 'HEALTHY',
          is_bottleneck: false,
        },
        {
          target_name: 'Core Target',
          target_host: '223.5.5.5',
          hop_number: 2,
          ip: '202.97.10.1',
          hostname: null,
          asn: 'AS4134',
          asn_org: 'China Telecom',
          geo: null,
          sent_count: 10,
          received_count: 10,
          loss_pct: 0,
          avg_rtt_ms: 12.0,
          best_rtt_ms: 11.5,
          worst_rtt_ms: 13.0,
          last_rtt_ms: 12.0,
          stddev_jitter_ms: 0.5,
          sparkline_samples: [],
          status: 'HEALTHY',
          is_bottleneck: false,
        },
      ],
      stage4_bufferbloat: {
        unloaded_latency_ms: 12.0,
        loaded_download_latency_ms: 18.0,
        loaded_upload_latency_ms: 22.0,
        bufferbloat_delta_ms: 10.0,
        rpm: 1050,
        grade: 'A+',
        download_bandwidth_mbps: 500,
        upload_bandwidth_mbps: 100,
      },
      stage5_transport: {
        target: '223.5.5.5',
        port: 443,
        tcp_handshake_ms: 22.0,
        tls_handshake_ms: 14.0,
        ttfb_ms: 45.0,
        tls_version: 'TLS 1.3',
        cipher_suite: 'TLS_AES_256_GCM_SHA384',
        path_mtu: 1500,
        pmtu_blackhole_detected: false,
      },
      summary: {
        id: 'RCA-BASE-01',
        timestamp: '2026-11-12 10:00:00',
        overall_severity: 'NORMAL',
        primary_cause_category: 'HEALTHY',
        headline: 'Healthy Baseline',
        detailed_explanation: 'All stages baseline healthy.',
        actionable_recommendation: 'None',
        affected_stages: [],
        findings: [],
        export_markdown: '',
        export_json: '',
      },
    };

    // Current report with degraded bufferbloat, increased TCP handshake, and an extra high-latency hop
    const mockCurrentReport: CompleteDiagnosticReport = {
      ...mockBaselineReport,
      stage4_bufferbloat: {
        ...mockBaselineReport.stage4_bufferbloat,
        bufferbloat_delta_ms: 75.0, // +65ms delta -> Critical
        rpm: 420,
        grade: 'C', // Grade A+ -> C regression
      },
      stage5_transport: {
        ...mockBaselineReport.stage5_transport,
        tcp_handshake_ms: 110.0, // +88ms delta -> Critical
        ttfb_ms: 210.0, // +165ms delta -> Critical
      },
      stage3_mtr: [
        mockBaselineReport.stage3_mtr[0],
        {
          ...mockBaselineReport.stage3_mtr[1],
          avg_rtt_ms: 68.0, // Surge of +56ms
        },
      ],
    };

    const diff = computeBaselineDiff(mockBaselineReport, mockCurrentReport, {
      label: '基准参照组-01',
      pinnedAt: 1731400000000,
      id: 'base_01',
    });

    assert.equal(diff.overallHealthStatus, 'CRITICAL');
    assert.equal(diff.kpis.bufferbloatGradeShift.isRegression, true);
    assert.equal(diff.kpis.bufferbloatGradeShift.baseline, 'A+');
    assert.equal(diff.kpis.bufferbloatGradeShift.current, 'C');
    assert.equal(diff.kpis.tcpHandshake.severity, 'CRITICAL');
    assert.equal(diff.topology.newHighLatencyHops.includes(2), true);
  });
});
