export type AnomalyTriggerReason =
  | 'AP_ROAMING_FLAP'
  | 'LATENCY_SPIKE'
  | 'BURST_LOSS'
  | 'MANUAL'
  | 'AUTO_SENTINEL';

export interface SentinelSample {
  timestamp: number;
  gateway_rtt: number | null;
  anycast_rtt: number | null;
  bssid: string | null;
  ssid: string | null;
  rssi: number | null;
  noise: number | null;
  is_gateway_loss: boolean;
  is_anycast_loss: boolean;
}

export interface SentinelBufferStats {
  sample_count: number;
  capacity: number;
  latest_gateway_rtt: number | null;
  latest_anycast_rtt: number | null;
  rolling_median_rtt_1m: number | null;
  rolling_jitter_1m: number | null;
  loss_rate_1m: number;
  current_bssid: string | null;
  current_ssid: string | null;
  current_rssi: number | null;
}

export interface IncidentReport {
  id: string;
  timestamp: number;
  trigger_reason: AnomalyTriggerReason;
  trigger_description: string;
  metrics_at_trigger: {
    gateway_rtt: number | null;
    anycast_rtt: number | null;
    rolling_median_rtt: number | null;
    rolling_jitter: number | null;
    loss_rate_pct: number;
    bssid: string | null;
    ssid: string | null;
    rssi: number | null;
    distinct_bssids_last_60s: string[];
  };
  frozen_samples: SentinelSample[];
}

export interface OllamaStatus {
  is_online: boolean;
  base_url: string;
  models: string[];
  default_model: string | null;
  message: string;
}
