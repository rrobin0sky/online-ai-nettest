import type { MtrHopResult } from '../../src/types/telemetry.ts';

export interface MtrSanitizationOptions {
  isDataPlaneHealthy?: boolean;
}

/**
 * Sanitizes MTR hops by applying topological analysis to filter out
 * Control Plane Policing (CoPP) / ICMP rate-limiting artifacts and edge firewall drops.
 */
export function sanitizeMtrHops(
  hops: MtrHopResult[],
  options: MtrSanitizationOptions = {}
): MtrHopResult[] {
  const { isDataPlaneHealthy = false } = options;
  if (!hops || hops.length === 0) return [];

  const result: MtrHopResult[] = hops.map((h) => ({
    ...h,
    anomaly_type: h.anomaly_type || null,
    is_bottleneck: false, // Reset for deterministic evaluation
  }));

  const totalHops = result.length;

  // 1. Identify trailing edge hops that drop ICMP (100% loss at end of trace)
  let firstTrailingDropIdx = totalHops;
  for (let i = totalHops - 1; i >= 0; i--) {
    if (result[i].received_count === 0 || result[i].loss_pct === 100) {
      firstTrailingDropIdx = i;
    } else {
      break;
    }
  }

  // If there are trailing drops but earlier hops were responsive and data plane is healthy
  if (firstTrailingDropIdx < totalHops && firstTrailingDropIdx > 0 && isDataPlaneHealthy) {
    for (let i = firstTrailingDropIdx; i < totalHops; i++) {
      result[i].anomaly_type = 'EDGE_FIREWALL_ICMP_DROP';
      result[i].is_bottleneck = false;
    }
  }

  // 2. Identify CoPP / ICMP Rate Limiting on intermediate hops
  for (let i = 0; i < totalHops; i++) {
    const currentHop = result[i];

    if (currentHop.anomaly_type === 'EDGE_FIREWALL_ICMP_DROP') {
      continue;
    }

    if (currentHop.loss_pct > 0) {
      // Look at downstream hops that responded
      const downstreamResponsiveHops = result
        .slice(i + 1)
        .filter((h) => h.received_count > 0 && h.anomaly_type !== 'EDGE_FIREWALL_ICMP_DROP');

      // Rule 1: CoPP / ICMP Rate Limiting:
      // If Hop N shows loss > 0%, BUT any downstream hop has lower loss (or 0% loss),
      // OR the final target's data-plane TCP handshake is healthy:
      const downstreamHasLowerLoss = downstreamResponsiveHops.some(
        (downstream) => downstream.loss_pct < currentHop.loss_pct
      );

      const downstreamLossDisappeared = downstreamResponsiveHops.some(
        (downstream) => downstream.loss_pct === 0
      );

      if (downstreamHasLowerLoss || downstreamLossDisappeared || isDataPlaneHealthy) {
        currentHop.anomaly_type = 'ICMP_RATE_LIMITED';
        currentHop.is_bottleneck = false;
      }
    }
  }

  // 3. Genuine Bottleneck Isolation
  // Only classify as genuine bottleneck if:
  // - Loss is >= 20%
  // - NOT tagged as ICMP_RATE_LIMITED or EDGE_FIREWALL_ICMP_DROP
  // - Downstream responsive hops persistently maintain high loss
  // - Data-plane is NOT overriding this (if data plane is healthy, backbone loss is ICMP artifact)
  if (!isDataPlaneHealthy) {
    for (let i = 0; i < totalHops; i++) {
      const hop = result[i];
      if (
        hop.loss_pct >= 20.0 &&
        hop.anomaly_type !== 'ICMP_RATE_LIMITED' &&
        hop.anomaly_type !== 'EDGE_FIREWALL_ICMP_DROP' &&
        hop.received_count > 0
      ) {
        const downstream = result
          .slice(i + 1)
          .filter((h) => h.received_count > 0 && h.anomaly_type !== 'EDGE_FIREWALL_ICMP_DROP');

        if (downstream.length > 0) {
          const sustainedLossCount = downstream.filter((h) => h.loss_pct >= 15.0).length;
          if (sustainedLossCount >= Math.ceil(downstream.length * 0.75)) {
            hop.is_bottleneck = true;
            hop.anomaly_type = 'GENUINE_LOSS';
            break; // First true bottleneck
          }
        }
      }
    }
  }

  return result;
}
