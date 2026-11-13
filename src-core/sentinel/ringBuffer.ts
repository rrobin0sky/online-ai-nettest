import type { SentinelSample, SentinelBufferStats } from '../../src/types/sentinel.ts';

export const DEFAULT_BUFFER_CAPACITY = 150; // 150 samples * 2s = 300s (5 minutes)

export class SentinelRingBuffer {
  private capacity: number;
  private buffer: SentinelSample[];

  constructor(capacity = DEFAULT_BUFFER_CAPACITY) {
    this.capacity = capacity <= 0 ? DEFAULT_BUFFER_CAPACITY : capacity;
    this.buffer = [];
  }

  public push(sample: SentinelSample): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift();
    }
    this.buffer.push(sample);
  }

  public get length(): number {
    return this.buffer.length;
  }

  public clear(): void {
    this.buffer = [];
  }

  public getAll(): SentinelSample[] {
    return [...this.buffer];
  }

  public getRecent(count: number): SentinelSample[] {
    const n = this.buffer.length;
    const skip = n > count ? n - count : 0;
    return this.buffer.slice(skip);
  }

  public latest(): SentinelSample | undefined {
    return this.buffer[this.buffer.length - 1];
  }

  /**
   * Calculate rolling median gateway RTT over the last N samples (e.g. 30 samples = 1 minute)
   */
  public rollingMedianGatewayRtt(count = 30): number | null {
    const recent = this.getRecent(count);
    const rtts = recent
      .map((s) => s.gateway_rtt)
      .filter((v): v is number => typeof v === 'number' && !isNaN(v))
      .sort((a, b) => a - b);

    if (rtts.length === 0) return null;
    const mid = Math.floor(rtts.length / 2);
    if (rtts.length % 2 === 0) {
      return Math.round(((rtts[mid - 1] + rtts[mid]) / 2) * 10) / 10;
    }
    return Math.round(rtts[mid] * 10) / 10;
  }

  /**
   * Calculate rolling jitter (standard deviation) over the last N samples
   */
  public rollingJitterGatewayRtt(count = 30): number | null {
    const recent = this.getRecent(count);
    const rtts = recent
      .map((s) => s.gateway_rtt)
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (rtts.length < 2) return null;
    const mean = rtts.reduce((acc, v) => acc + v, 0) / rtts.length;
    const variance = rtts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / rtts.length;
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  /**
   * Calculate packet loss rate (%) over the last N samples
   */
  public lossRateRecent(count = 30): number {
    const recent = this.getRecent(count);
    if (recent.length === 0) return 0;
    const lostCount = recent.filter((s) => s.is_gateway_loss || s.is_anycast_loss).length;
    return Math.round((lostCount / recent.length) * 1000) / 10;
  }

  /**
   * Compute full buffer summary stats
   */
  public computeStats(): SentinelBufferStats {
    const lat = this.latest();
    return {
      sample_count: this.length,
      capacity: this.capacity,
      latest_gateway_rtt: lat?.gateway_rtt ?? null,
      latest_anycast_rtt: lat?.anycast_rtt ?? null,
      rolling_median_rtt_1m: this.rollingMedianGatewayRtt(30),
      rolling_jitter_1m: this.rollingJitterGatewayRtt(30),
      loss_rate_1m: this.lossRateRecent(30),
      current_bssid: lat?.bssid ?? null,
      current_ssid: lat?.ssid ?? null,
      current_rssi: lat?.rssi ?? null,
    };
  }
}
