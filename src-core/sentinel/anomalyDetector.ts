import type {
  AnomalyTriggerReason,
  IncidentReport,
  SentinelSample,
} from '../../src/types/sentinel.ts';
import { SentinelRingBuffer } from './ringBuffer.ts';

export const COOLDOWN_DURATION_MS = 180_000; // 3 minutes cooldown
export const LATENCY_SPIKE_THRESHOLD_MS = 150.0; // +150ms jump over 1m rolling median
export const SLIDING_WINDOW_SAMPLES = 30; // 30 samples * 2s = 60s

export class AnomalyDetector {
  private lastTriggerTimestamp = 0;
  private cooldownMs: number;

  constructor(cooldownMs = COOLDOWN_DURATION_MS) {
    this.cooldownMs = cooldownMs;
  }

  public remainingCooldownMs(currentTimeMs: number): number {
    if (this.lastTriggerTimestamp === 0) return 0;
    const elapsed = currentTimeMs - this.lastTriggerTimestamp;
    return elapsed < this.cooldownMs ? this.cooldownMs - elapsed : 0;
  }

  public isInCooldown(currentTimeMs: number): boolean {
    return this.remainingCooldownMs(currentTimeMs) > 0;
  }

  public evaluate(
    ringBuffer: SentinelRingBuffer,
    currentTimeMs: number
  ): IncidentReport | null {
    const latest = ringBuffer.latest();
    if (!latest) return null;

    // Enforce strict cooldown between triggers
    if (this.isInCooldown(currentTimeMs)) {
      return null;
    }

    // Need at least 2 samples to evaluate
    if (ringBuffer.length < 2) {
      return null;
    }

    let trigger: { reason: AnomalyTriggerReason; description: string } | null = null;

    // Rule 1: Burst Packet Loss (>= 2 consecutive timeouts)
    const recentSamples = ringBuffer.getRecent(2);
    if (recentSamples.length >= 2) {
      const consecutiveGwLoss = recentSamples.every((s) => s.is_gateway_loss);
      const consecutiveAnycastLoss = recentSamples.every((s) => s.is_anycast_loss);
      if (consecutiveGwLoss || consecutiveAnycastLoss) {
        const target = consecutiveGwLoss ? '本地网关' : 'Anycast公共出口';
        trigger = {
          reason: 'BURST_LOSS',
          description: `检测到连续2次探测丢包超时 (目标: ${target})`,
        };
      }
    }

    // Rule 2: Wi-Fi BSSID Roaming Flapping (>= 2 distinct non-empty BSSIDs within 60s window)
    if (!trigger) {
      const slidingWindow = ringBuffer.getRecent(SLIDING_WINDOW_SAMPLES);
      const distinctBssids = Array.from(
        new Set(
          slidingWindow
            .map((s) => s.bssid?.trim())
            .filter((b): b is string => Boolean(b && b.length > 0))
        )
      );

      if (distinctBssids.length >= 2) {
        trigger = {
          reason: 'AP_ROAMING_FLAP',
          description: `检测到60秒内发生AP漫游漂移 (观察到${distinctBssids.length}个不同BSSID: ${distinctBssids.join(', ')})`,
        };
      }
    }

    // Rule 3: Latency Spike (> +150ms jump over 1-minute rolling median)
    if (!trigger && typeof latest.gateway_rtt === 'number') {
      const medianRtt = ringBuffer.rollingMedianGatewayRtt(SLIDING_WINDOW_SAMPLES);
      if (typeof medianRtt === 'number' && latest.gateway_rtt > medianRtt + LATENCY_SPIKE_THRESHOLD_MS) {
        trigger = {
          reason: 'LATENCY_SPIKE',
          description: `网关延迟突增尖刺: 当前 ${latest.gateway_rtt.toFixed(1)}ms (基线中位数 ${medianRtt.toFixed(1)}ms, 增幅 +${(latest.gateway_rtt - medianRtt).toFixed(1)}ms > 150ms)`,
        };
      }
    }

    if (trigger) {
      this.lastTriggerTimestamp = currentTimeMs;

      const slidingWindow = ringBuffer.getRecent(SLIDING_WINDOW_SAMPLES);
      const distinctBssids = Array.from(
        new Set(
          slidingWindow
            .map((s) => s.bssid?.trim())
            .filter((b): b is string => Boolean(b && b.length > 0))
        )
      );

      return {
        id: `inc_${currentTimeMs}_${trigger.reason}`,
        timestamp: currentTimeMs,
        trigger_reason: trigger.reason,
        trigger_description: trigger.description,
        metrics_at_trigger: {
          gateway_rtt: latest.gateway_rtt,
          anycast_rtt: latest.anycast_rtt,
          rolling_median_rtt: ringBuffer.rollingMedianGatewayRtt(SLIDING_WINDOW_SAMPLES),
          rolling_jitter: ringBuffer.rollingJitterGatewayRtt(SLIDING_WINDOW_SAMPLES),
          loss_rate_pct: ringBuffer.lossRateRecent(SLIDING_WINDOW_SAMPLES),
          bssid: latest.bssid,
          ssid: latest.ssid,
          rssi: latest.rssi,
          distinct_bssids_last_60s: distinctBssids,
        },
        frozen_samples: slidingWindow,
      };
    }

    return null;
  }
}
