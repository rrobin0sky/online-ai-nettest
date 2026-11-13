import { CompleteDiagnosticReport, SeverityLevel } from './telemetry';

export interface DiagnosticSnapshot {
  id: string; // UUID v4 or timestamp-based ID
  timestamp: number; // Unix epoch ms
  targetSummary: string; // e.g., "DNS: www.aliyun.com | MTR: AliCloud East (223.5.5.5)"
  overallStatus: SeverityLevel; // 'HEALTHY' | 'DEGRADED' | 'CRITICAL'
  triggerReason?: 'MANUAL' | 'AP_ROAMING_FLAP' | 'LATENCY_SPIKE' | 'BURST_LOSS' | 'AUTO_SENTINEL' | 'SCHEDULED';
  triggerDescription?: string;
  keyMetrics: {
    gatewayRtt: number;
    gatewayJitter: number;
    localDnsRtt: number;
    bufferbloatGrade: string;
    maxHopLossRate: number;
    ttfb: number;
  };
  rawTelemetry: CompleteDiagnosticReport; // Full telemetry payload for re-inspection
}
