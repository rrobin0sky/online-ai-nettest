import { useState, useEffect, useCallback } from 'react';
import type { DiagnosticSnapshot } from '../types/history.ts';

export const GOLDEN_BASELINE_STORAGE_KEY = 'netpath_lens_golden_baseline_v1';
export const BASELINE_CHANGE_EVENT = 'netpath_golden_baseline_change';

export interface GoldenBaselineRecord {
  id: string;
  label: string;
  pinnedAt: number;
  snapshot: DiagnosticSnapshot;
}

/**
 * Load the persistent golden baseline from storage (immune to FIFO eviction)
 */
export function getGoldenBaseline(): GoldenBaselineRecord | null {
  try {
    const raw = localStorage.getItem(GOLDEN_BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.snapshot) {
      return parsed as GoldenBaselineRecord;
    }
  } catch (err) {
    console.error('Failed to load golden baseline from localStorage:', err);
  }
  return null;
}

/**
 * Save a diagnostic snapshot as the persistent Golden Baseline
 */
export function setGoldenBaseline(
  snapshot: DiagnosticSnapshot,
  label: string = '企业生产黄金基线 (Golden Baseline)'
): GoldenBaselineRecord {
  const record: GoldenBaselineRecord = {
    id: `baseline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: label.trim() || '企业生产黄金基线',
    pinnedAt: Date.now(),
    snapshot,
  };

  try {
    localStorage.setItem(GOLDEN_BASELINE_STORAGE_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent(BASELINE_CHANGE_EVENT, { detail: record }));
  } catch (err) {
    console.error('Failed to save golden baseline:', err);
  }

  return record;
}

/**
 * Remove / unpin the Golden Baseline
 */
export function removeGoldenBaseline(): void {
  try {
    localStorage.removeItem(GOLDEN_BASELINE_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(BASELINE_CHANGE_EVENT, { detail: null }));
  } catch (err) {
    console.error('Failed to remove golden baseline:', err);
  }
}

/**
 * Update the baseline label
 */
export function updateBaselineLabel(newLabel: string): void {
  const current = getGoldenBaseline();
  if (current) {
    current.label = newLabel.trim();
    try {
      localStorage.setItem(GOLDEN_BASELINE_STORAGE_KEY, JSON.stringify(current));
      window.dispatchEvent(new CustomEvent(BASELINE_CHANGE_EVENT, { detail: current }));
    } catch (err) {
      console.error('Failed to update baseline label:', err);
    }
  }
}

/**
 * React hook to subscribe to persistent Golden Baseline updates
 */
export function useGoldenBaseline() {
  const [baseline, setBaselineState] = useState<GoldenBaselineRecord | null>(() => getGoldenBaseline());

  useEffect(() => {
    const handleStorageChange = () => {
      setBaselineState(getGoldenBaseline());
    };

    window.addEventListener(BASELINE_CHANGE_EVENT, handleStorageChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(BASELINE_CHANGE_EVENT, handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const pinBaseline = useCallback((snapshot: DiagnosticSnapshot, label?: string) => {
    const rec = setGoldenBaseline(snapshot, label);
    setBaselineState(rec);
    return rec;
  }, []);

  const unpinBaseline = useCallback(() => {
    removeGoldenBaseline();
    setBaselineState(null);
  }, []);

  const renameBaseline = useCallback((newLabel: string) => {
    updateBaselineLabel(newLabel);
    setBaselineState(getGoldenBaseline());
  }, []);

  return {
    baseline,
    hasBaseline: Boolean(baseline),
    pinBaseline,
    unpinBaseline,
    renameBaseline,
  };
}
