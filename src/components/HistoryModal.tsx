import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  History,
  Trash2,
  Eye,
  GitCompare,
  ArrowLeft,
  Calendar,
  Server,
  Zap,
  Globe,
  Radio,
  Clock,
  Sparkles,
  Star,
} from 'lucide-react';
import { CompleteDiagnosticReport, DiagnosticSnapshot, SeverityLevel } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: DiagnosticSnapshot[];
  currentLiveReport: CompleteDiagnosticReport | null;
  activeSnapshotId: string | null;
  onInspectSnapshot: (snapshot: DiagnosticSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onClearHistory: () => void;
  onOpenAiWithSnapshot?: (snapshot: DiagnosticSnapshot) => void;
  onPinAsBaseline?: (snapshot: DiagnosticSnapshot) => void;
  goldenBaselineId?: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  currentLiveReport,
  activeSnapshotId,
  onInspectSnapshot,
  onDeleteSnapshot,
  onClearHistory,
  onOpenAiWithSnapshot,
  onPinAsBaseline,
  goldenBaselineId,
}) => {
  const { t } = useTranslation();
  const [diffingSnapshot, setDiffingSnapshot] = useState<DiagnosticSnapshot | null>(null);

  if (!isOpen) return null;

  const formatTimestamp = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).replace(/\//g, '-');
  };

  const getRelativeTime = (ts: number): string => {
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  const statusBadgeColor: Record<SeverityLevel, string> = {
    NORMAL: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
    DEGRADED: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
    CRITICAL: 'bg-rose-950/80 border-rose-500/40 text-rose-300 animate-pulse',
  };

  // Render Diff Table
  const renderDiffView = () => {
    if (!diffingSnapshot || !currentLiveReport) return null;

    const snap = diffingSnapshot.rawTelemetry;
    const live = currentLiveReport;

    const snapSysDns = snap.stage2_dns.find((d) => d.is_system_default) || snap.stage2_dns[0];
    const liveSysDns = live.stage2_dns.find((d) => d.is_system_default) || live.stage2_dns[0];

    const snapMaxLoss = snap.stage3_mtr.length > 0 ? Math.max(...snap.stage3_mtr.map((h) => h.loss_pct)) : 0;
    const liveMaxLoss = live.stage3_mtr.length > 0 ? Math.max(...live.stage3_mtr.map((h) => h.loss_pct)) : 0;

    const metricsComparison = [
      {
        label: t('stage1.avgRtt'),
        unit: 'ms',
        snapVal: snap.stage1_link.gateway_rtt_avg_ms ?? 0,
        liveVal: live.stage1_link.gateway_rtt_avg_ms ?? 0,
        lowerIsBetter: true,
      },
      {
        label: t('stage1.jitter'),
        unit: 'ms',
        snapVal: snap.stage1_link.gateway_jitter_ms ?? 0,
        liveVal: live.stage1_link.gateway_jitter_ms ?? 0,
        lowerIsBetter: true,
      },
      {
        label: t('stage2.latency') + ' (Local DNS)',
        unit: 'ms',
        snapVal: snapSysDns?.latency_ms ?? 0,
        liveVal: liveSysDns?.latency_ms ?? 0,
        lowerIsBetter: true,
      },
      {
        label: t('stage4.queueDelta'),
        unit: 'ms',
        snapVal: snap.stage4_bufferbloat.bufferbloat_delta_ms,
        liveVal: live.stage4_bufferbloat.bufferbloat_delta_ms,
        lowerIsBetter: true,
      },
      {
        label: t('stage4.appleResponsiveness'),
        unit: 'RPM',
        snapVal: snap.stage4_bufferbloat.rpm,
        liveVal: live.stage4_bufferbloat.rpm,
        lowerIsBetter: false,
      },
      {
        label: t('stage3.lossPct') + ' (Max Hop)',
        unit: '%',
        snapVal: snapMaxLoss,
        liveVal: liveMaxLoss,
        lowerIsBetter: true,
      },
      {
        label: t('stage5.tcpHandshake'),
        unit: 'ms',
        snapVal: snap.stage5_transport.tcp_handshake_ms,
        liveVal: live.stage5_transport.tcp_handshake_ms,
        lowerIsBetter: true,
      },
      {
        label: t('stage5.ttfb'),
        unit: 'ms',
        snapVal: snap.stage5_transport.ttfb_ms,
        liveVal: live.stage5_transport.ttfb_ms,
        lowerIsBetter: true,
      },
      {
        label: t('stage1.snrRf'),
        unit: 'dB',
        snapVal: snap.stage1_link.snr_db ?? 0,
        liveVal: live.stage1_link.snr_db ?? 0,
        lowerIsBetter: false,
      },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDiffingSnapshot(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title={t('history.closeDiff')}
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
            </button>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-cyan-400" />
                {t('history.diffTitle')}
              </h4>
              <p className="text-xs text-slate-400 font-mono">
                {t('history.diffDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              Snapshot: {formatTimestamp(diffingSnapshot.timestamp)}
            </span>
            <span className="text-slate-500">vs</span>
            <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
              Current Live
            </span>
          </div>
        </div>

        {/* Diff Table */}
        <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#070a12]">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-500 text-[11px] bg-[#0c101c]">
                <th className="py-2.5 px-4 font-normal">{t('history.metric')}</th>
                <th className="py-2.5 px-4 font-normal text-right">{t('history.snapshotVal')}</th>
                <th className="py-2.5 px-4 font-normal text-right">{t('history.currentVal')}</th>
                <th className="py-2.5 px-4 font-normal text-right">{t('history.delta')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {metricsComparison.map((m, idx) => {
                const diff = Number((m.liveVal - m.snapVal).toFixed(1));
                let diffClass = 'text-slate-400';
                let sign = '';

                if (diff !== 0) {
                  sign = diff > 0 ? '+' : '';
                  const isImprovement = m.lowerIsBetter ? diff < 0 : diff > 0;
                  diffClass = isImprovement ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
                }

                return (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 px-4 text-slate-300 font-medium">{m.label}</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">
                      {m.snapVal} {m.unit}
                    </td>
                    <td className="py-2.5 px-4 text-right text-white font-semibold">
                      {m.liveVal} {m.unit}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${diffClass}`}>
                      {diff === 0 ? '0' : `${sign}${diff} ${m.unit}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b0f1a] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0e1322]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  {t('history.title')}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-semibold">
                  {snapshots.length} / 10
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('history.desc')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[68vh] text-xs font-mono space-y-4">
          {diffingSnapshot ? (
            renderDiffView()
          ) : snapshots.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#121828] border border-white/[0.06] flex items-center justify-center mx-auto text-slate-400">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-300">{t('history.empty')}</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {t('history.emptyDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snap) => {
                const isActive = activeSnapshotId === snap.id;
                const snapDate = formatTimestamp(snap.timestamp);
                const relTime = getRelativeTime(snap.timestamp);

                return (
                  <div
                    key={snap.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-950/40'
                        : 'bg-[#080b13] border-white/[0.06] hover:border-white/[0.12] hover:bg-[#0c101c]'
                    }`}
                  >
                    {/* Top Row: Timestamp, Badges, Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                      <div className="flex items-center space-x-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadgeColor[snap.overallStatus]}`}>
                          {snap.overallStatus}
                        </span>
                        <span className="text-white font-bold flex items-center gap-1.5 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          {snapDate}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ({relTime})
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.2 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-500/50 text-[10px] font-semibold animate-pulse">
                            ACTIVE REPLAY
                          </span>
                        )}
                        {snap.id === goldenBaselineId && (
                          <span className="px-2 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-500/50 text-[10px] font-bold flex items-center gap-1 shadow-sm">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            {t('baseline.isBaselineBadge', '★ 黄金基线')}
                          </span>
                        )}
                        {snap.triggerReason && (
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-bold border ${
                              snap.triggerReason === 'AP_ROAMING_FLAP'
                                ? 'bg-purple-950/80 text-purple-300 border-purple-500/50'
                                : snap.triggerReason === 'LATENCY_SPIKE'
                                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                                : snap.triggerReason === 'BURST_LOSS'
                                ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                                : 'bg-blue-950/80 text-blue-300 border-blue-500/50'
                            }`}
                          >
                            {snap.triggerReason === 'AP_ROAMING_FLAP'
                              ? t('sentinel.incidentApFlap', 'AP 漫游漂移')
                              : snap.triggerReason === 'LATENCY_SPIKE'
                              ? t('sentinel.incidentSpike', '延迟尖刺')
                              : snap.triggerReason === 'BURST_LOSS'
                              ? t('sentinel.incidentLoss', '突发丢包')
                              : t('sentinel.incidentManual', '哨兵快照')}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-2">
                        {onPinAsBaseline && snap.id !== goldenBaselineId && (
                          <button
                            onClick={() => onPinAsBaseline(snap)}
                            className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-mono font-medium text-amber-300 bg-amber-950/40 border border-amber-500/40 hover:bg-amber-900/50 transition-colors cursor-pointer"
                            title={t('baseline.pinButton', '设为黄金基线')}
                          >
                            <Star className="w-3.5 h-3.5 text-amber-400" />
                            <span>{t('baseline.pinButton', '锁为基线')}</span>
                          </button>
                        )}

                        {onOpenAiWithSnapshot && (
                          <button
                            onClick={() => {
                              onInspectSnapshot(snap);
                              onOpenAiWithSnapshot(snap);
                              onClose();
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium text-amber-200 bg-amber-950/40 border border-amber-500/40 hover:bg-amber-900/50 transition-colors cursor-pointer"
                            title={t('history.askAi')}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>AI</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            onInspectSnapshot(snap);
                            onClose();
                          }}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-cyan-600 text-white'
                              : 'bg-[#151c2e] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#1f2b45]'
                          }`}
                          title={t('history.inspect')}
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isActive ? t('history.inspecting') : t('history.inspect')}</span>
                        </button>

                        {currentLiveReport && (
                          <button
                            onClick={() => setDiffingSnapshot(snap)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#151c2e] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#1f2b45] transition-colors cursor-pointer"
                            title={t('history.diff')}
                          >
                            <GitCompare className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{t('history.diff')}</span>
                          </button>
                        )}

                        <button
                          onClick={() => onDeleteSnapshot(snap.id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title={t('history.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Middle: Target Summary */}
                    <div className="py-2 text-[11px] text-slate-400 flex items-center gap-2">
                      <span className="text-slate-500">Target:</span>
                      <span className="text-slate-200 truncate">{snap.targetSummary}</span>
                    </div>

                    {/* Bottom: 4 Key Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.04] text-[11px]">
                      <div className="bg-[#0b0f1a] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-slate-500 text-[10px] block flex items-center gap-1">
                          <Server className="w-3 h-3 text-cyan-400" />
                          {t('stage1.gatewayIp')}
                        </span>
                        <span className="text-white font-bold">{snap.keyMetrics.gatewayRtt} ms</span>
                        <span className="text-slate-500 text-[10px] ml-1">(±{snap.keyMetrics.gatewayJitter}ms)</span>
                      </div>

                      <div className="bg-[#0b0f1a] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-slate-500 text-[10px] block flex items-center gap-1">
                          <Globe className="w-3 h-3 text-indigo-400" />
                          {t('stage2.latency')} (DNS)
                        </span>
                        <span className="text-white font-bold">{snap.keyMetrics.localDnsRtt} ms</span>
                      </div>

                      <div className="bg-[#0b0f1a] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-slate-500 text-[10px] block flex items-center gap-1">
                          <Zap className="w-3 h-3 text-violet-400" />
                          {t('stage4.bufferbloatRating')}
                        </span>
                        <span className="text-cyan-300 font-bold">Grade {snap.keyMetrics.bufferbloatGrade}</span>
                      </div>

                      <div className="bg-[#0b0f1a] p-2 rounded-lg border border-white/[0.03]">
                        <span className="text-slate-500 text-[10px] block flex items-center gap-1">
                          <Radio className="w-3 h-3 text-rose-400" />
                          {t('stage3.lossPct')} (Max)
                        </span>
                        <span className={`font-bold ${snap.keyMetrics.maxHopLossRate > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {snap.keyMetrics.maxHopLossRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/[0.08] bg-[#0e1322] flex items-center justify-between">
          <div>
            {snapshots.length > 0 && !diffingSnapshot && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('history.clearConfirm'))) {
                    onClearHistory();
                  }
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-rose-400 bg-rose-950/30 border border-rose-500/30 hover:bg-rose-950/60 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('history.clearAll')}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-mono text-slate-300 bg-[#161f36] border border-white/[0.1] hover:bg-[#1f2b4a] transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
