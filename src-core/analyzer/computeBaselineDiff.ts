import type { CompleteDiagnosticReport, MtrHopResult } from '../../src/types/telemetry.ts';

export interface MetricDelta {
  baselineValue: number;
  currentValue: number;
  delta: number;
  formattedDelta: string;
  unit: string;
  isRegression: boolean;
  severity: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface AsnPathDiff {
  baselineAsnPath: string[];
  currentAsnPath: string[];
  isRouteShiftDetected: boolean;
  shiftExplanation: string | null;
  newAsns: string[];
  removedAsns: string[];
}

export interface HopDiff {
  hopNumber: number;
  baselineIp: string | null;
  currentIp: string | null;
  baselineAsn: string | null;
  currentAsn: string | null;
  baselineRtt: number | null;
  currentRtt: number | null;
  rttDelta: number | null;
  baselineLoss: number;
  currentLoss: number;
  lossDelta: number;
  isHighLatencyJump: boolean;
  isLossIncrease: boolean;
  status: 'STABLE' | 'DEGRADED' | 'IMPROVED' | 'NEW_HOP' | 'ROUTE_CHANGED';
}

export interface BaselineDiffResult {
  baselineId: string;
  baselineLabel: string;
  baselineTimestamp: number;
  currentTimestamp: number;
  overallHealthStatus: 'STABLE' | 'DEGRADED' | 'CRITICAL';
  summaryHeadline: string;

  kpis: {
    gatewayRtt: MetricDelta;
    gatewayJitter: MetricDelta;
    dnsLatency: MetricDelta;
    bufferbloatDelta: MetricDelta;
    bufferbloatRpm: MetricDelta;
    bufferbloatGradeShift: {
      baseline: string;
      current: string;
      isRegression: boolean;
    };
    tcpHandshake: MetricDelta;
    ttfb: MetricDelta;
  };

  topology: {
    baselineHopCount: number;
    currentHopCount: number;
    hopCountDelta: number;
    asnDiff: AsnPathDiff;
    hopDiffs: HopDiff[];
    newHighLatencyHops: number[];
    sustainedLossHops: number[];
  };
}

const GRADE_RANKS: Record<string, number> = {
  'A+': 6,
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
};

function formatSigned(val: number, unit: string = 'ms'): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)} ${unit}`.trim();
}

function calculateMetricDelta(
  baseline: number,
  current: number,
  unit: string,
  lowerIsBetter: boolean,
  warnThreshold: number,
  critThreshold: number
): MetricDelta {
  const delta = current - baseline;
  let isRegression = false;
  let severity: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

  if (lowerIsBetter) {
    if (delta >= critThreshold) {
      isRegression = true;
      severity = 'CRITICAL';
    } else if (delta >= warnThreshold) {
      isRegression = true;
      severity = 'WARNING';
    }
  } else {
    // Higher is better (e.g. RPM)
    if (delta <= -critThreshold) {
      isRegression = true;
      severity = 'CRITICAL';
    } else if (delta <= -warnThreshold) {
      isRegression = true;
      severity = 'WARNING';
    }
  }

  return {
    baselineValue: baseline,
    currentValue: current,
    delta: Math.round(delta * 100) / 100,
    formattedDelta: formatSigned(delta, unit),
    unit,
    isRegression,
    severity,
  };
}

/**
 * Extracts unique ordered ASN sequence, filtering out private LAN / loopback and deduplicating consecutive hops
 */
export function extractAsnPath(hops: MtrHopResult[]): string[] {
  if (!hops || hops.length === 0) return [];
  const sequence: string[] = [];

  for (const h of hops) {
    const rawAsn = h.asn ? h.asn.trim() : null;
    if (rawAsn && rawAsn !== 'LAN' && rawAsn !== 'CGNAT' && !rawAsn.toLowerCase().includes('local')) {
      const formatted = rawAsn.startsWith('AS') ? rawAsn : `AS${rawAsn}`;
      if (sequence.length === 0 || sequence[sequence.length - 1] !== formatted) {
        sequence.push(formatted);
      }
    }
  }

  return sequence;
}

/**
 * Compares two ordered ASN paths to detect route shifts or transit carrier detours
 */
export function compareAsnPaths(baseline: string[], current: string[]): AsnPathDiff {
  const isIdentical =
    baseline.length === current.length && baseline.every((asn, idx) => asn === current[idx]);

  const baselineSet = new Set(baseline);
  const currentSet = new Set(current);

  const newAsns = current.filter((asn) => !baselineSet.has(asn));
  const removedAsns = baseline.filter((asn) => !currentSet.has(asn));

  let shiftExplanation: string | null = null;
  if (!isIdentical) {
    const fromStr = baseline.length > 0 ? baseline.join(' → ') : 'Direct/LAN';
    const toStr = current.length > 0 ? current.join(' → ') : 'Direct/LAN';
    shiftExplanation = `检测到承载网与路由路径偏移 (ASN Detour): 基准路径 [${fromStr}] 切换为 [${toStr}]。`;
    if (newAsns.length > 0) {
      shiftExplanation += ` 新增路径节点: [${newAsns.join(', ')}]。`;
    }
    if (removedAsns.length > 0) {
      shiftExplanation += ` 移出路径节点: [${removedAsns.join(', ')}]。`;
    }
  }

  return {
    baselineAsnPath: baseline,
    currentAsnPath: current,
    isRouteShiftDetected: !isIdentical,
    shiftExplanation,
    newAsns,
    removedAsns,
  };
}

/**
 * Computes deep differential comparison between a Golden Baseline report and a current diagnostic report
 */
export function computeBaselineDiff(
  baselineReport: CompleteDiagnosticReport,
  currentReport: CompleteDiagnosticReport,
  baselineMetadata?: { label?: string; pinnedAt?: number; id?: string }
): BaselineDiffResult {
  const bL = baselineReport.stage1_link;
  const cL = currentReport.stage1_link;

  const bDns =
    baselineReport.stage2_dns.find((d) => d.is_system_default) || baselineReport.stage2_dns[0];
  const cDns =
    currentReport.stage2_dns.find((d) => d.is_system_default) || currentReport.stage2_dns[0];

  const bBbloat = baselineReport.stage4_bufferbloat;
  const cBbloat = currentReport.stage4_bufferbloat;

  const bTrans = baselineReport.stage5_transport;
  const cTrans = currentReport.stage5_transport;

  // 1. KPI Metric Deltas
  const gatewayRtt = calculateMetricDelta(
    bL.gateway_rtt_avg_ms ?? 0,
    cL.gateway_rtt_avg_ms ?? 0,
    'ms',
    true,
    5.0,
    15.0
  );

  const gatewayJitter = calculateMetricDelta(
    bL.gateway_jitter_ms ?? 0,
    cL.gateway_jitter_ms ?? 0,
    'ms',
    true,
    3.0,
    8.0
  );

  const dnsLatency = calculateMetricDelta(
    bDns?.latency_ms ?? 0,
    cDns?.latency_ms ?? 0,
    'ms',
    true,
    20.0,
    50.0
  );

  const bufferbloatDelta = calculateMetricDelta(
    bBbloat.bufferbloat_delta_ms ?? 0,
    cBbloat.bufferbloat_delta_ms ?? 0,
    'ms',
    true,
    25.0,
    60.0
  );

  const bufferbloatRpm = calculateMetricDelta(
    bBbloat.rpm ?? 0,
    cBbloat.rpm ?? 0,
    'RPM',
    false,
    150.0,
    350.0
  );

  const bRank = GRADE_RANKS[bBbloat.grade] ?? 3;
  const cRank = GRADE_RANKS[cBbloat.grade] ?? 3;
  const bufferbloatGradeShift = {
    baseline: bBbloat.grade,
    current: cBbloat.grade,
    isRegression: cRank < bRank,
  };

  const tcpHandshake = calculateMetricDelta(
    bTrans.tcp_handshake_ms ?? 0,
    cTrans.tcp_handshake_ms ?? 0,
    'ms',
    true,
    30.0,
    80.0
  );

  const ttfb = calculateMetricDelta(
    bTrans.ttfb_ms ?? 0,
    cTrans.ttfb_ms ?? 0,
    'ms',
    true,
    60.0,
    150.0
  );

  // 2. MTR Topology & ASN Path Diff
  const bMtr = baselineReport.stage3_mtr;
  const cMtr = currentReport.stage3_mtr;

  const baselineAsnPath = extractAsnPath(bMtr);
  const currentAsnPath = extractAsnPath(cMtr);
  const asnDiff = compareAsnPaths(baselineAsnPath, currentAsnPath);

  const maxHops = Math.max(bMtr.length, cMtr.length);
  const hopDiffs: HopDiff[] = [];
  const newHighLatencyHops: number[] = [];
  const sustainedLossHops: number[] = [];

  for (let i = 0; i < maxHops; i++) {
    const hopNumber = i + 1;
    const bHop = bMtr[i];
    const cHop = cMtr[i];

    const bIp = bHop?.ip || null;
    const cIp = cHop?.ip || null;
    const bAsn = bHop?.asn || null;
    const cAsn = cHop?.asn || null;
    const bRtt = bHop?.avg_rtt_ms ?? null;
    const cRtt = cHop?.avg_rtt_ms ?? null;
    const bLoss = bHop?.loss_pct ?? 0;
    const cLoss = cHop?.loss_pct ?? 0;

    const rttDelta =
      bRtt !== null && cRtt !== null ? Math.round((cRtt - bRtt) * 10) / 10 : null;
    const lossDelta = Math.round((cLoss - bLoss) * 10) / 10;

    const isHighLatencyJump = rttDelta !== null && rttDelta >= 40.0;
    const isLossIncrease = lossDelta >= 15.0;

    if (isHighLatencyJump) {
      newHighLatencyHops.push(hopNumber);
    }
    if (isLossIncrease && cHop && cHop.received_count > 0) {
      sustainedLossHops.push(hopNumber);
    }

    let status: HopDiff['status'] = 'STABLE';
    if (!bHop && cHop) {
      status = 'NEW_HOP';
    } else if (bIp && cIp && bIp !== cIp) {
      status = 'ROUTE_CHANGED';
    } else if (isHighLatencyJump || isLossIncrease) {
      status = 'DEGRADED';
    } else if (rttDelta !== null && rttDelta <= -15.0) {
      status = 'IMPROVED';
    }

    hopDiffs.push({
      hopNumber,
      baselineIp: bIp,
      currentIp: cIp,
      baselineAsn: bAsn,
      currentAsn: cAsn,
      baselineRtt: bRtt,
      currentRtt: cRtt,
      rttDelta,
      baselineLoss: bLoss,
      currentLoss: cLoss,
      lossDelta,
      isHighLatencyJump,
      isLossIncrease,
      status,
    });
  }

  // 3. Determine Overall Health Status & Headline
  const criticalCount = [gatewayRtt, gatewayJitter, dnsLatency, tcpHandshake, ttfb].filter(
    (k) => k.severity === 'CRITICAL'
  ).length;

  const warningCount = [gatewayRtt, gatewayJitter, dnsLatency, tcpHandshake, ttfb].filter(
    (k) => k.severity === 'WARNING'
  ).length;

  let overallHealthStatus: BaselineDiffResult['overallHealthStatus'] = 'STABLE';
  let summaryHeadline = '链路表现与黄金基线相符 (Performance Matches Baseline)';

  if (criticalCount > 0 || sustainedLossHops.length > 0) {
    overallHealthStatus = 'CRITICAL';
    summaryHeadline = '检测到严重链路指标衰退 (Severe Performance Regression Against Baseline)';
  } else if (asnDiff.isRouteShiftDetected || warningCount > 0 || newHighLatencyHops.length > 0 || bufferbloatGradeShift.isRegression) {
    overallHealthStatus = 'DEGRADED';
    if (asnDiff.isRouteShiftDetected) {
      summaryHeadline = '路由路径发生偏移绕行 (ASN Route Detour Shift Detected)';
    } else {
      summaryHeadline = '部分链路指标轻微劣于基线 (Moderate Metrics Regression Against Baseline)';
    }
  }

  return {
    baselineId: baselineMetadata?.id || baselineReport.summary.id || 'golden_baseline',
    baselineLabel: baselineMetadata?.label || '黄金基线',
    baselineTimestamp: baselineMetadata?.pinnedAt || Date.now(),
    currentTimestamp: Date.now(),
    overallHealthStatus,
    summaryHeadline,
    kpis: {
      gatewayRtt,
      gatewayJitter,
      dnsLatency,
      bufferbloatDelta,
      bufferbloatRpm,
      bufferbloatGradeShift,
      tcpHandshake,
      ttfb,
    },
    topology: {
      baselineHopCount: bMtr.length,
      currentHopCount: cMtr.length,
      hopCountDelta: cMtr.length - bMtr.length,
      asnDiff,
      hopDiffs,
      newHighLatencyHops,
      sustainedLossHops,
    },
  };
}
