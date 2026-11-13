import type {
  DiagnosticSummary,
  RcaFinding,
  SeverityLevel,
  RcaCategory,
  WiFiInterfaceInfo,
  ProxyTopologyInfo,
  DnsBenchmarkResult,
  MtrHopResult,
  BufferbloatMetric,
  TransportTlsMetric,
} from '../../src/types/telemetry.ts';
import { sanitizeMtrHops } from './mtrSanitizer.ts';

export interface RcaEvaluationOptions {
  dnsTarget?: string;
  mtrTargetHost?: string;
}

export class HierarchicalRcaEngine {
  /**
   * Evaluates complete telemetry with Data-Plane First Hierarchical Arbitration
   */
  public static evaluate(
    link: WiFiInterfaceInfo,
    proxy: ProxyTopologyInfo,
    dns: DnsBenchmarkResult[],
    rawMtr: MtrHopResult[],
    bufferbloat: BufferbloatMetric,
    transport: TransportTlsMetric
  ): DiagnosticSummary {
    const findings: RcaFinding[] = [];
    const affectedStages: number[] = [];

    // 1. Data-Plane Health Assessment
    const sysDns = dns.find((d) => d.is_system_default) || dns[0];
    const isDnsClean =
      Boolean(sysDns) &&
      sysDns.status === 'SUCCESS' &&
      (sysDns.latency_ms ?? 999.0) < 120.0;

    const isTcpClean =
      transport.tcp_handshake_ms > 0.0 && transport.tcp_handshake_ms < 250.0;

    const isTtfbClean =
      transport.ttfb_ms > 0.0 && transport.ttfb_ms < 600.0;

    const isPmtuClean = !transport.pmtu_blackhole_detected;

    const isDataPlaneHealthy = isDnsClean && isTcpClean && isTtfbClean && isPmtuClean;

    // 2. Sanitize MTR hops with topological CoPP & edge drop filters
    const mtr = sanitizeMtrHops(rawMtr, { isDataPlaneHealthy });

    // ---------------- STAGE 1: LOCAL LINK & WI-FI ----------------
    if (link.snr_db !== null && link.snr_db < 20) {
      affectedStages.push(1);
      findings.push({
        stage: 1,
        severity: 'DEGRADED',
        rule_id: 'RULE_WIFI_WEAK_SNR',
        message: 'Wi-Fi Signal Weak / High RF Noise',
        metric_evidence: `SNR: ${link.snr_db} dB (threshold < 20 dB), Noise: ${link.noise_dbm ?? -95} dBm`,
      });
    }

    if (link.rssi_dbm !== null && link.rssi_dbm < -75) {
      if (!affectedStages.includes(1)) affectedStages.push(1);
      findings.push({
        stage: 1,
        severity: 'DEGRADED',
        rule_id: 'RULE_WIFI_WEAK_RSSI',
        message: 'Low Wi-Fi RSSI Signal Strength',
        metric_evidence: `RSSI: ${link.rssi_dbm} dBm (threshold < -75 dBm)`,
      });
    }

    if (link.gateway_jitter_ms !== null && link.gateway_jitter_ms > 15.0) {
      affectedStages.push(1);
      findings.push({
        stage: 1,
        severity: 'CRITICAL',
        rule_id: 'RULE_GATEWAY_JITTER_HIGH',
        message: 'High Local Gateway Jitter / AP Roaming Flapping',
        metric_evidence: `Gateway Jitter: ${link.gateway_jitter_ms.toFixed(1)}ms (threshold > 15.0ms)`,
      });
    }

    if (link.gateway_packet_loss_pct > 3.0) {
      affectedStages.push(1);
      findings.push({
        stage: 1,
        severity: 'CRITICAL',
        rule_id: 'RULE_GATEWAY_LOSS',
        message: 'Local Gateway Packet Loss',
        metric_evidence: `Default Gateway Loss: ${link.gateway_packet_loss_pct.toFixed(1)}%`,
      });
    }

    // ---------------- STAGE 2: DNS & PROXY ----------------
    if (proxy.proxy_enabled) {
      findings.push({
        stage: 2,
        severity: 'NORMAL',
        rule_id: 'RULE_PROXY_ACTIVE',
        message: 'System Proxy In Use',
        metric_evidence: `Active Proxies: HTTP: ${proxy.http_proxy || 'None'}, SOCKS: ${proxy.socks_proxy || 'None'}`,
      });
    }

    if (sysDns && sysDns.latency_ms) {
      const publicDnsSuccess = dns.filter(
        (d) => !d.is_system_default && d.status === 'SUCCESS' && d.latency_ms !== null
      );
      const minPublicLat =
        publicDnsSuccess.length > 0
          ? Math.min(...publicDnsSuccess.map((d) => d.latency_ms!))
          : 20.0;

      if (sysDns.latency_ms > 60.0 && minPublicLat < 25.0) {
        affectedStages.push(2);
        findings.push({
          stage: 2,
          severity: 'DEGRADED',
          rule_id: 'RULE_DNS_CONGESTION',
          message: 'Enterprise Local DNS Forwarder Congested',
          metric_evidence: `Local DNS Latency: ${sysDns.latency_ms.toFixed(1)}ms vs Public DNS: ${minPublicLat.toFixed(1)}ms`,
        });
      }

      if (sysDns.geo_mismatch) {
        affectedStages.push(2);
        findings.push({
          stage: 2,
          severity: 'DEGRADED',
          rule_id: 'RULE_DNS_SPLIT_HORIZON',
          message: 'DNS Split-Horizon or GeoDNS Misrouting Detected',
          metric_evidence: 'System local DNS resolved IP differs from public Anycast nodes',
        });
      }
    }

    // ---------------- STAGE 3: WAN BACKBONE & MTR ----------------
    // CoPP Rate Limiting informational finding
    const coppHops = mtr.filter((h) => h.anomaly_type === 'ICMP_RATE_LIMITED');
    if (coppHops.length > 0) {
      findings.push({
        stage: 3,
        severity: 'NORMAL',
        rule_id: 'RULE_MTR_COPP_FILTERED',
        message: 'Intermediate Router Control Plane Policing (CoPP) Detected',
        metric_evidence: `Hops [${coppHops.map((h) => `#${h.hop_number}`).join(', ')}] rate-limited ICMP; downstream traffic and data-plane remain lossless.`,
      });
    }

    // Edge drop informational finding
    const edgeDropHops = mtr.filter((h) => h.anomaly_type === 'EDGE_FIREWALL_ICMP_DROP');
    if (edgeDropHops.length > 0) {
      findings.push({
        stage: 3,
        severity: 'NORMAL',
        rule_id: 'RULE_MTR_EDGE_FIREWALL_FILTERED',
        message: 'Destination Edge Firewall ICMP Drop Detected',
        metric_evidence: `Edge nodes [${edgeDropHops.map((h) => `#${h.hop_number}`).join(', ')}] dropped ICMP ECHO; verified reachable via L4 TCP (${transport.tcp_handshake_ms}ms).`,
      });
    }

    // Genuine bottleneck check (Only valid if NOT overridden by healthy data plane)
    const bottleneckHop = mtr.find((h) => h.is_bottleneck);
    if (bottleneckHop && !isDataPlaneHealthy) {
      affectedStages.push(3);
      findings.push({
        stage: 3,
        severity: 'CRITICAL',
        rule_id: 'RULE_MTR_BOTTLENECK',
        message: `WAN Transit Bottleneck Isolated at Hop #${bottleneckHop.hop_number}`,
        metric_evidence: `Hop #${bottleneckHop.hop_number} [${bottleneckHop.ip || '*'} - ${bottleneckHop.asn_org || 'Unknown'}]: Loss: ${bottleneckHop.loss_pct.toFixed(1)}%, Avg RTT: ${bottleneckHop.avg_rtt_ms?.toFixed(1) ?? 'N/A'}ms`,
      });
    }

    // ---------------- STAGE 4: BUFFERBLOAT ----------------
    if (bufferbloat.bufferbloat_delta_ms > 80.0) {
      affectedStages.push(4);
      findings.push({
        stage: 4,
        severity: isDataPlaneHealthy ? 'DEGRADED' : 'CRITICAL',
        rule_id: 'RULE_BUFFERBLOAT_SATURATION',
        message: 'Severe Bufferbloat Detected on Office Egress Router',
        metric_evidence: `Bufferbloat Delta: +${bufferbloat.bufferbloat_delta_ms.toFixed(1)}ms, RPM: ${bufferbloat.rpm}, Grade: ${bufferbloat.grade}`,
      });
    }

    // ---------------- STAGE 5: TRANSPORT & TLS ----------------
    if (transport.pmtu_blackhole_detected) {
      affectedStages.push(5);
      findings.push({
        stage: 5,
        severity: 'CRITICAL',
        rule_id: 'RULE_PMTU_BLACKHOLE',
        message: 'Path MTU Blackhole Detected (DF packet dropped without ICMP)',
        metric_evidence: `Negotiated MTU: ${transport.path_mtu}, Standard 1500 byte packet failed`,
      });
    }

    const uniqueAffectedStages = Array.from(new Set(affectedStages)).sort((a, b) => a - b);

    // ---------------- DATA-PLANE FIRST ARBITRATION ----------------
    let overallSeverity: SeverityLevel = 'NORMAL';
    let primaryCause: RcaCategory = 'HEALTHY';
    let headline = 'Optimal End-to-End Enterprise Connectivity';
    let explanation =
      'All 5 diagnostic layers (L1 Wi-Fi, L2 Gateway, L3 DNS/MTR, L4 Bufferbloat, L7 TLS) meet or exceed enterprise SLAs.';
    let recommendation = 'No immediate action required. Telemetry baseline verified.';

    if (isDataPlaneHealthy) {
      // Data-plane is verified healthy! Filter out any control-plane false alarms.
      const hasLocalDegraded = findings.some(
        (f) =>
          f.severity === 'DEGRADED' &&
          ['RULE_WIFI_WEAK_SNR', 'RULE_WIFI_WEAK_RSSI', 'RULE_DNS_CONGESTION', 'RULE_BUFFERBLOAT_SATURATION'].includes(
            f.rule_id
          )
      );

      if (hasLocalDegraded) {
        overallSeverity = 'DEGRADED';
        const degradedFinding = findings.find((f) => f.severity === 'DEGRADED')!;
        headline = `Data-Plane Healthy with Minor Advisory: ${degradedFinding.message}`;
        explanation = `L4/L7 transport is verified healthy (TCP: ${transport.tcp_handshake_ms}ms, TTFB: ${transport.ttfb_ms}ms). Local link advisory noted: ${degradedFinding.metric_evidence}`;
        recommendation = 'Network transport is functional. Consider optimizing local AP placement or router queue settings.';

        if (degradedFinding.rule_id.startsWith('RULE_WIFI')) {
          primaryCause = 'LOCAL_WI_FI';
        } else if (degradedFinding.rule_id === 'RULE_BUFFERBLOAT_SATURATION') {
          primaryCause = 'BUFFERBLOAT';
        } else if (degradedFinding.rule_id === 'RULE_DNS_CONGESTION') {
          primaryCause = 'LOCAL_DNS';
        }
      } else {
        overallSeverity = 'NORMAL';
        primaryCause = 'HEALTHY';
        if (coppHops.length > 0 || edgeDropHops.length > 0) {
          headline =
            'Data-Plane Verified: Optimal End-to-End Enterprise Connectivity (ICMP Artifacts Filtered)';
          explanation = `Data-plane performance is fully verified: DNS (${sysDns?.latency_ms ?? 0}ms), TCP 3-way handshake (${transport.tcp_handshake_ms}ms), and TTFB (${transport.ttfb_ms}ms) are lossless. Packet loss observed at intermediate MTR hops is attributed to router Control Plane Policing (CoPP) or ICMP rate-limiting and does not affect application traffic.`;
          recommendation =
            'No escalation required. Real user application traffic is unaffected by router ICMP rate-limiting.';
        }
      }
    } else {
      // Data-plane is impaired; evaluate true critical bottlenecks
      const criticalFinding = findings.find((f) => f.severity === 'CRITICAL');
      const degradedFinding = findings.find((f) => f.severity === 'DEGRADED');

      if (criticalFinding) {
        overallSeverity = 'CRITICAL';
        switch (criticalFinding.rule_id) {
          case 'RULE_GATEWAY_JITTER_HIGH':
          case 'RULE_GATEWAY_LOSS':
            primaryCause = 'LOCAL_GATEWAY';
            headline = 'Local Gateway / AP Instability Detected';
            explanation = `Deterministic root cause: Local gateway ${link.gateway_ip || 'Default Gateway'} exhibits severe jitter or packet loss (${criticalFinding.metric_evidence}).`;
            recommendation =
              'Verify enterprise AP channel utilization, check for co-channel interference or reboot local switch/router.';
            break;
          case 'RULE_MTR_BOTTLENECK':
            primaryCause = 'DOMESTIC_ISP';
            headline = 'External WAN Backbone Peering Congestion';
            explanation = `Deterministic root cause: Local Wi-Fi and Gateway are healthy, but confirmed packet loss persists through external peering node (${criticalFinding.metric_evidence}) and impairs data-plane traffic.`;
            recommendation =
              'Escalate trouble ticket to upstream ISP / Transit provider with attached MTR telemetry.';
            break;
          case 'RULE_BUFFERBLOAT_SATURATION':
            primaryCause = 'BUFFERBLOAT';
            headline = 'Egress Router Bufferbloat Queue Saturation';
            explanation = `Egress router lacks SQM/FQ-CoDel. Latency spikes by +${bufferbloat.bufferbloat_delta_ms.toFixed(1)}ms under concurrent load.`;
            recommendation =
              'Enable Smart Queue Management (SQM) or FQ-CoDel on office border router/firewall.';
            break;
          case 'RULE_PMTU_BLACKHOLE':
            primaryCause = 'DOMESTIC_ISP';
            headline = 'Path MTU Blackhole on Transit Link';
            explanation =
              'Intermediate router silently discards packets larger than MTU without sending ICMP Fragmentation Needed.';
            recommendation =
              'Configure TCP MSS Clamping to 1420 on egress firewall or tune client interface MTU.';
            break;
          default:
            primaryCause = 'LOCAL_WI_FI';
            headline = 'Physical Link Degradation';
            explanation = criticalFinding.message;
            recommendation = 'Inspect local physical layer cabling or Wi-Fi configuration.';
            break;
        }
      } else if (degradedFinding) {
        overallSeverity = 'DEGRADED';
        headline = degradedFinding.message;
        explanation = degradedFinding.metric_evidence;
        recommendation = 'Monitor telemetry and inspect local network configuration.';
      }
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const id = `RCA-${Date.now()}`;

    return {
      id,
      timestamp: now,
      overall_severity: overallSeverity,
      primary_cause_category: primaryCause,
      headline,
      detailed_explanation: explanation,
      actionable_recommendation: recommendation,
      affected_stages: uniqueAffectedStages,
      findings,
      export_markdown: '',
      export_json: '',
    };
  }
}
