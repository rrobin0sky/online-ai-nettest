import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Star,
  GitCompare,
  Activity,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  X,
  Trash2,
  Route,
  Server,
  Layers,
} from 'lucide-react';
import type { BaselineDiffResult } from '../services/baselineDiff';

interface BaselineDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diff: BaselineDiffResult | null;
  onAskAi: () => void;
  onUnpinBaseline: () => void;
}

export const BaselineDiffModal: React.FC<BaselineDiffModalProps> = ({
  isOpen,
  onClose,
  diff,
  onAskAi,
  onUnpinBaseline,
}) => {
  const { t } = useTranslation();

  if (!isOpen || !diff) return null;

  const severityBadge = {
    STABLE: {
      bg: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
      icon: CheckCircle2,
      label: t('baseline.statusStable', '基线指标稳定 (Stable)'),
    },
    DEGRADED: {
      bg: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
      icon: AlertTriangle,
      label: t('baseline.statusDegraded', '指标轻微劣化 (Degraded)'),
    },
    CRITICAL: {
      bg: 'bg-rose-950/60 border-rose-500/40 text-rose-300 animate-pulse',
      icon: XCircle,
      label: t('baseline.statusCritical', '严重性能衰退 (Critical)'),
    },
  }[diff.overallHealthStatus];

  const StatusIcon = severityBadge.icon;

  const getDeltaPill = (deltaVal: number, unit: string, lowerIsBetter: boolean = true) => {
    const isWorse = lowerIsBetter ? deltaVal > 0 : deltaVal < 0;
    const isMuchWorse = lowerIsBetter ? deltaVal >= 30 : deltaVal <= -150;
    const sign = deltaVal > 0 ? '+' : '';

    if (Math.abs(deltaVal) < 0.1) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
          ±0.0 {unit}
        </span>
      );
    }

    if (isMuchWorse) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950/80 text-rose-300 border border-rose-500/50">
          {sign}{deltaVal.toFixed(1)} {unit}
        </span>
      );
    }

    if (isWorse) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/50">
          {sign}{deltaVal.toFixed(1)} {unit}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50">
        {sign}{deltaVal.toFixed(1)} {unit}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b0e18] border border-white/[0.12] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between gap-4 bg-[#0e1322]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  {t('baseline.diffTitle', '黄金基线链路差异对比')}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {diff.baselineLabel}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border flex items-center gap-1.5 ${severityBadge.bg}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {severityBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('baseline.pinnedAt', '基线固化于')}: {new Date(diff.baselineTimestamp).toLocaleString()} | {t('baseline.comparedNow', '当前比对时间')}: {new Date(diff.currentTimestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onAskAi}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 transition-all shadow-md shadow-violet-600/30 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>{t('baseline.askAiAnalysis', 'AI 研判基线差异')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Headline Banner */}
        <div className={`px-5 py-3 border-b text-xs font-mono flex items-center justify-between ${
          diff.overallHealthStatus === 'CRITICAL'
            ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            : diff.overallHealthStatus === 'DEGRADED'
            ? 'bg-amber-950/30 border-amber-500/30 text-amber-300'
            : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
        }`}>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{diff.summaryHeadline}</span>
          </div>
          {diff.topology.asnDiff.isRouteShiftDetected && (
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
              {t('baseline.asnShiftDetected', 'ASN 路由路径发生偏移')}
            </span>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Section 1: KPI Metric Deltas Grid */}
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              {t('baseline.kpiDeltas', '核心 KPI 时延指标增量对比 (Metric Deltas)')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Gateway RTT */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    {t('stage1.avgRtt', '默认网关 RTT')}
                  </span>
                  {getDeltaPill(diff.kpis.gatewayRtt.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')}</span>
                    {diff.kpis.gatewayRtt.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')}</span>
                    {diff.kpis.gatewayRtt.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>

              {/* Gateway Jitter */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>{t('stage1.jitter', '网关抖动 (Jitter)')}</span>
                  {getDeltaPill(diff.kpis.gatewayJitter.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')}</span>
                    ±{diff.kpis.gatewayJitter.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')}</span>
                    ±{diff.kpis.gatewayJitter.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>

              {/* DNS Latency */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>{t('stage2.systemDns', '本地 DNS 解析时延')}</span>
                  {getDeltaPill(diff.kpis.dnsLatency.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')}</span>
                    {diff.kpis.dnsLatency.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')}</span>
                    {diff.kpis.dnsLatency.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>

              {/* Bufferbloat Delta */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>{t('stage4.queueDelta', '满载缓冲膨胀增量')}</span>
                  {getDeltaPill(diff.kpis.bufferbloatDelta.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')} ({diff.kpis.bufferbloatGradeShift.baseline})</span>
                    +{diff.kpis.bufferbloatDelta.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')} ({diff.kpis.bufferbloatGradeShift.current})</span>
                    +{diff.kpis.bufferbloatDelta.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>

              {/* TCP Handshake */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>{t('stage5.tcpHandshake', 'TCP 三次握手时延')}</span>
                  {getDeltaPill(diff.kpis.tcpHandshake.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')}</span>
                    {diff.kpis.tcpHandshake.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')}</span>
                    {diff.kpis.tcpHandshake.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>

              {/* TTFB */}
              <div className="bg-[#121624] border border-white/[0.08] rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>{t('stage5.ttfb', '首包响应时间 (TTFB)')}</span>
                  {getDeltaPill(diff.kpis.ttfb.delta, 'ms', true)}
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <div className="text-xs text-slate-400">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.base', '基线')}</span>
                    {diff.kpis.ttfb.baselineValue.toFixed(1)} ms
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="text-sm font-bold text-white text-right">
                    <span className="text-[10px] text-slate-500 block">{t('baseline.curr', '当前')}</span>
                    {diff.kpis.ttfb.currentValue.toFixed(1)} ms
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: ASN Route Path & Topology Diff */}
          <div className="bg-[#121624] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-indigo-400" />
                {t('baseline.asnPathDiff', '自治系统 (ASN) 路由路径对比与绕行检测')}
              </h3>
              <span className="text-xs font-mono text-slate-400">
                {t('stage3.hop', '跳数')}: {diff.topology.baselineHopCount} → {diff.topology.currentHopCount} ({diff.topology.hopCountDelta >= 0 ? `+${diff.topology.hopCountDelta}` : diff.topology.hopCountDelta} {t('baseline.hops', '跳')})
              </span>
            </div>

            {/* Side by side ASN sequence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-[#090c14] border border-white/[0.06]">
                <span className="text-[11px] font-mono text-slate-500 block mb-1.5">
                  [基线路径] {diff.baselineLabel} ({diff.topology.baselineHopCount} hops)
                </span>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  {diff.topology.asnDiff.baselineAsnPath.length === 0 ? (
                    <span className="text-slate-500 text-xs">Direct Link / Private LAN</span>
                  ) : (
                    diff.topology.asnDiff.baselineAsnPath.map((asn, idx) => (
                      <React.Fragment key={idx}>
                        <span className="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-300">
                          {asn}
                        </span>
                        {idx < diff.topology.asnDiff.baselineAsnPath.length - 1 && (
                          <span className="text-slate-600">→</span>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#090c14] border border-white/[0.06]">
                <span className="text-[11px] font-mono text-slate-500 block mb-1.5">
                  [当前路径] 实测路由 ({diff.topology.currentHopCount} hops)
                </span>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  {diff.topology.asnDiff.currentAsnPath.length === 0 ? (
                    <span className="text-slate-500 text-xs">Direct Link / Private LAN</span>
                  ) : (
                    diff.topology.asnDiff.currentAsnPath.map((asn, idx) => {
                      const isNew = diff.topology.asnDiff.newAsns.includes(asn);
                      return (
                        <React.Fragment key={idx}>
                          <span
                            className={`px-2 py-0.5 rounded border ${
                              isNew
                                ? 'bg-rose-950/80 border-rose-500 text-rose-300 font-bold'
                                : 'bg-cyan-950/80 border-cyan-700/60 text-cyan-300'
                            }`}
                          >
                            {asn}
                            {isNew && ' (NEW)'}
                          </span>
                          {idx < diff.topology.asnDiff.currentAsnPath.length - 1 && (
                            <span className="text-slate-600">→</span>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Route Shift Warning Callout */}
            {diff.topology.asnDiff.isRouteShiftDetected && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-start space-x-2 mt-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <span className="font-bold">{t('baseline.asnShiftAlert', '检测到承载网与路由路径偏移 (ASN Route Detour)')}</span>
                  <p className="text-amber-300/90 mt-0.5">{diff.topology.asnDiff.shiftExplanation}</p>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Hop-by-Hop Comparison Table */}
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              {t('baseline.hopTableTitle', '逐跳路由时延与丢包率对比 (Hop-by-Hop Diff)')}
            </h3>

            <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0c101c]">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400 text-[11px] bg-[#121624]">
                    <th className="py-2.5 px-3 w-12">{t('stage3.hop', '跳数')}</th>
                    <th className="py-2.5 px-3">{t('baseline.baseNode', '基线节点 (IP / ASN)')}</th>
                    <th className="py-2.5 px-3">{t('baseline.currNode', '当前节点 (IP / ASN)')}</th>
                    <th className="py-2.5 px-3 text-right">{t('stage3.avgRtt', '基线 RTT')}</th>
                    <th className="py-2.5 px-3 text-right">{t('stage3.avgRtt', '当前 RTT')}</th>
                    <th className="py-2.5 px-3 text-center">{t('baseline.rttDelta', '时延增量')}</th>
                    <th className="py-2.5 px-3 text-center">{t('stage3.lossPct', '丢包率对比')}</th>
                    <th className="py-2.5 px-3 text-center w-24">{t('baseline.status', '状态')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {diff.topology.hopDiffs.map((h) => {
                    const isJump = h.isHighLatencyJump;
                    const isLossInc = h.isLossIncrease;

                    return (
                      <tr
                        key={h.hopNumber}
                        className={`hover:bg-white/[0.02] ${
                          isJump || isLossInc ? 'bg-rose-950/15' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-bold text-slate-400">
                          #{h.hopNumber}
                        </td>
                        <td className="py-2 px-3">
                          <span className={h.baselineIp ? 'text-slate-300' : 'text-slate-600'}>
                            {h.baselineIp || '* * *'}
                          </span>
                          {h.baselineAsn && (
                            <span className="ml-1.5 px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 text-[10px]">
                              {h.baselineAsn}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={h.currentIp ? 'text-white' : 'text-slate-600'}>
                            {h.currentIp || '* * *'}
                          </span>
                          {h.currentAsn && (
                            <span className="ml-1.5 px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[10px]">
                              {h.currentAsn}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          {h.baselineRtt !== null ? `${h.baselineRtt}ms` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white">
                          {h.currentRtt !== null ? `${h.currentRtt}ms` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {h.rttDelta !== null ? getDeltaPill(h.rttDelta, 'ms', true) : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-slate-400">{h.baselineLoss.toFixed(0)}%</span>
                          <span className="mx-1 text-slate-600">→</span>
                          <span className={`font-bold ${h.currentLoss > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {h.currentLoss.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {h.status === 'NEW_HOP' && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px]">
                              {t('baseline.newHop', '新增跳')}
                            </span>
                          )}
                          {h.status === 'ROUTE_CHANGED' && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px]">
                              {t('baseline.routeChanged', '路径变更')}
                            </span>
                          )}
                          {h.status === 'DEGRADED' && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                              {t('baseline.degraded', '时延激增')}
                            </span>
                          )}
                          {h.status === 'IMPROVED' && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px]">
                              {t('baseline.improved', '时延降低')}
                            </span>
                          )}
                          {h.status === 'STABLE' && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                              {t('baseline.stable', '平稳')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#0c101c] flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (window.confirm(t('baseline.confirmUnpin', '确认取消当前的黄金基线锁定吗？'))) {
                onUnpinBaseline();
                onClose();
              }
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-500/30 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('baseline.unpinBaseline', '取消基线锁定')}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t('common.close', '关闭')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
