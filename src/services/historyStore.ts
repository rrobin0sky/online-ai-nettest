import { useState, useEffect, useCallback } from 'react';
import { CompleteDiagnosticReport, DiagnosticSnapshot } from '../types';

const HISTORY_STORAGE_KEY = 'netpath_lens_history_v1';
export const MAX_HISTORY_ITEMS = 10;
const HISTORY_CHANGE_EVENT = 'netpath_history_change';

/**
 * Load all diagnostic history snapshots from persistent storage
 */
export function loadHistorySnapshots(): DiagnosticSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_HISTORY_ITEMS);
    }
  } catch (err) {
    console.error('Failed to load diagnostic snapshots from localStorage:', err);
  }
  return [];
}

/**
 * Save a new diagnostic snapshot with FIFO eviction (capped strictly at 10 items)
 */
export function saveSnapshot(
  report: CompleteDiagnosticReport,
  targetSummary: string,
  triggerReason?: DiagnosticSnapshot['triggerReason'],
  triggerDescription?: string
): DiagnosticSnapshot {
  const existing = loadHistorySnapshots();

  const sysDns = report.stage2_dns.find((d) => d.is_system_default) || report.stage2_dns[0];
  const maxLoss = report.stage3_mtr.length > 0
    ? Math.max(...report.stage3_mtr.map((h) => h.loss_pct), 0)
    : 0;

  const newSnapshot: DiagnosticSnapshot = {
    id: report.summary.id || `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    targetSummary: targetSummary || 'Default Pipeline Benchmark',
    overallStatus: report.summary.overall_severity || 'NORMAL',
    triggerReason,
    triggerDescription,
    keyMetrics: {
      gatewayRtt: report.stage1_link.gateway_rtt_avg_ms ?? 0,
      gatewayJitter: report.stage1_link.gateway_jitter_ms ?? 0,
      localDnsRtt: sysDns?.latency_ms ?? 0,
      bufferbloatGrade: report.stage4_bufferbloat.grade || 'N/A',
      maxHopLossRate: maxLoss,
      ttfb: report.stage5_transport.ttfb_ms ?? 0,
    },
    rawTelemetry: report,
  };

  // Prepend to top; FIFO eviction ensures length <= MAX_HISTORY_ITEMS
  const updated = [newSnapshot, ...existing].slice(0, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: updated }));
  } catch (err) {
    console.error('Failed to save diagnostic snapshot:', err);
  }

  return newSnapshot;
}

/**
 * Delete a specific snapshot by ID
 */
export function deleteSnapshot(id: string): void {
  const existing = loadHistorySnapshots();
  const updated = existing.filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: updated }));
  } catch (err) {
    console.error('Failed to delete snapshot:', err);
  }
}

/**
 * Clear all history snapshots
 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail: [] }));
  } catch (err) {
    console.error('Failed to clear history snapshots:', err);
  }
}

/**
 * Reactive React hook for diagnostic history
 */
export function useHistoryStore() {
  const [snapshots, setSnapshots] = useState<DiagnosticSnapshot[]>(() => loadHistorySnapshots());

  useEffect(() => {
    const handleStorageChange = () => {
      setSnapshots(loadHistorySnapshots());
    };

    window.addEventListener(HISTORY_CHANGE_EVENT, handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(HISTORY_CHANGE_EVENT, handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const add = useCallback(
    (
      report: CompleteDiagnosticReport,
      targetSummary: string,
      triggerReason?: DiagnosticSnapshot['triggerReason'],
      triggerDescription?: string
    ) => {
      return saveSnapshot(report, targetSummary, triggerReason, triggerDescription);
    },
    []
  );

  const remove = useCallback((id: string) => {
    deleteSnapshot(id);
  }, []);

  const clear = useCallback(() => {
    clearHistory();
  }, []);

  return {
    snapshots,
    count: snapshots.length,
    maxCapacity: MAX_HISTORY_ITEMS,
    addSnapshot: add,
    deleteSnapshot: remove,
    clearHistory: clear,
  };
}
