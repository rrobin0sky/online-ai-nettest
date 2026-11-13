import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertOctagon,
  RotateCcw,
  Network,
} from 'lucide-react';
import { MtrHopResult } from '../types';

interface MtrTableProps {
  hops: MtrHopResult[];
  currentTargetHost: string;
  onSelectTarget: (name: string, host: string) => void;
  onRunMtr: (protocol?: 'ICMP' | 'TCP') => void;
  isLoading: boolean;
}

export const MtrTable: React.FC<MtrTableProps> = ({
  hops,
  currentTargetHost,
  onSelectTarget,
  onRunMtr,
  isLoading,
}) => {
  const { t } = useTranslation();
  const [customHost, setCustomHost] = useState('');
  const [protocol, setProtocol] = useState<'ICMP' | 'TCP'>('ICMP');

  const targetPresets = [
    { name: 'AliCloud East (BGP)', host: '223.5.5.5' },
    { name: 'Tencent Cloud Core', host: '119.29.29.29' },
    { name: 'Baidu Edge Network', host: '180.101.50.242' },
    { name: 'Cloudflare Anycast', host: '1.1.1.1' },
    { name: 'AWS CloudFront Edge', host: '13.32.0.1' },
    { name: 'GitHub Asia Node', host: '20.205.243.166' },
  ];

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customHost.trim()) {
      onSelectTarget(`Custom (${customHost})`, customHost.trim());
    }
  };

  const bottleneckHop = hops.find((h) => h.is_bottleneck);

  return (
    <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
      {/* Header & Target Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-white/[0.08] gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('stage3.title')}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-700/50 font-mono">
                {protocol === 'TCP' ? 'TCP SYN 443' : 'Adaptive ICMP (15-30 pkts)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {t('stage3.desc')}
            </p>
          </div>
        </div>

        {/* Target Buttons, Protocol Selector & Custom Input */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Protocol Toggle */}
          <div className="flex items-center bg-[#080b13] p-0.5 rounded-lg border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setProtocol('ICMP')}
              className={`px-2 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                protocol === 'ICMP'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('stage3.protoIcmp')}
            </button>
            <button
              type="button"
              onClick={() => setProtocol('TCP')}
              className={`px-2 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                protocol === 'TCP'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('stage3.protoTcp')}
            </button>
          </div>

          {targetPresets.slice(0, 4).map((tPreset, idx) => (
            <button
              key={idx}
              onClick={() => onSelectTarget(tPreset.name, tPreset.host)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                currentTargetHost === tPreset.host
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-semibold shadow-sm'
                  : 'bg-[#121828] border border-white/[0.06] text-slate-400 hover:text-white'
              }`}
            >
              {tPreset.name}
            </button>
          ))}

          <form onSubmit={handleCustomSubmit} className="flex items-center space-x-1.5">
            <input
              type="text"
              value={customHost}
              onChange={(e) => setCustomHost(e.target.value)}
              placeholder={t('stage3.customPlaceholder')}
              className="px-2.5 py-1 rounded-lg bg-[#080b13] border border-white/[0.1] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-28"
            />
            <button
              type="submit"
              className="p-1.5 rounded-lg bg-[#151c30] border border-white/[0.08] text-slate-300 hover:text-white cursor-pointer"
              title="Trace custom endpoint"
            >
              <Network className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          </form>

          <button
            onClick={() => onRunMtr(protocol)}
            disabled={isLoading}
            className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-mono font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('stage3.trace')}</span>
          </button>
        </div>
      </div>

      {/* Bottleneck Alert Banner */}
      {bottleneckHop && (
        <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center space-x-2.5">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            {t('stage3.bottleneckAlert')} ({bottleneckHop.loss_pct}% loss at #{bottleneckHop.hop_number} {bottleneckHop.ip})
          </span>
        </div>
      )}

      {/* MTR Hop Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-white/[0.08] text-slate-500 text-[11px]">
              <th className="pb-2.5 font-normal w-12">{t('stage3.hop')}</th>
              <th className="pb-2.5 font-normal w-36">{t('stage3.hostIp')}</th>
              <th className="pb-2.5 font-normal">{t('stage3.asnOrg')}</th>
              <th className="pb-2.5 font-normal">{t('stage3.location')}</th>
              <th className="pb-2.5 font-normal text-center w-16">{t('stage3.lossPct')}</th>
              <th className="pb-2.5 font-normal text-right w-20">{t('stage3.avgRtt')}</th>
              <th className="pb-2.5 font-normal text-right w-16">{t('stage3.best')}</th>
              <th className="pb-2.5 font-normal text-right w-16">{t('stage3.worst')}</th>
              <th className="pb-2.5 font-normal text-right w-16">{t('stage3.jitter')}</th>
              <th className="pb-2.5 font-normal text-center w-24">{t('stage3.trend')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {hops.map((h) => {
              const isBottleneck = h.is_bottleneck;
              const isLoss = h.loss_pct > 0;
              const isCopp = h.anomaly_type === 'ICMP_RATE_LIMITED';
              const isEdgeDrop = h.anomaly_type === 'EDGE_FIREWALL_ICMP_DROP';

              return (
                <tr
                  key={h.hop_number}
                  className={`hover:bg-white/[0.02] transition-colors ${
                    isBottleneck
                      ? 'bg-rose-950/20 text-rose-200'
                      : isCopp
                      ? 'bg-amber-950/10'
                      : isEdgeDrop
                      ? 'bg-sky-950/10'
                      : ''
                  }`}
                >
                  {/* Hop # */}
                  <td className="py-2.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isBottleneck
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : isCopp
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : isEdgeDrop
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      #{h.hop_number}
                    </span>
                  </td>

                  {/* IP Address */}
                  <td className="py-2.5 font-medium">
                    <span className={h.ip ? 'text-white' : 'text-slate-600'}>
                      {h.ip || '* * *'}
                    </span>
                  </td>

                  {/* ASN & Org + Anomaly Badges */}
                  <td className="py-2.5 text-slate-300">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {h.asn && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px]">
                          {h.asn}
                        </span>
                      )}
                      <span className="truncate max-w-[200px] text-slate-300">
                        {h.asn_org || 'Internal Transit Hop'}
                      </span>

                      {/* Anomaly Badges */}
                      {isCopp && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-medium inline-flex items-center gap-1"
                          title="ICMP Rate Limited by Router Control Plane Policing (Data-plane unaffected)"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          {t('stage3.badgeCopp')}
                        </span>
                      )}

                      {isEdgeDrop && (
                        <span
                          className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 text-[10px] font-medium inline-flex items-center gap-1"
                          title="Edge Firewall Drops ICMP ECHO (L4 TCP/TLS reachable)"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                          {t('stage3.badgeEdgeDrop')}
                        </span>
                      )}

                      {isBottleneck && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-medium inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                          {t('stage3.badgeBottleneck')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Geo */}
                  <td className="py-2.5 text-slate-400 truncate max-w-[140px]">
                    {h.geo || '-'}
                  </td>

                  {/* Loss % */}
                  <td className="py-2.5 text-center">
                    <span
                      className={`font-bold ${
                        isCopp
                          ? 'text-amber-400/90'
                          : h.loss_pct >= 20
                          ? 'text-rose-400'
                          : h.loss_pct > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {h.loss_pct.toFixed(0)}%
                    </span>
                  </td>

                  {/* Avg RTT */}
                  <td className="py-2.5 text-right font-bold text-white">
                    {h.avg_rtt_ms ? `${h.avg_rtt_ms}ms` : '-'}
                  </td>

                  {/* Best */}
                  <td className="py-2.5 text-right text-slate-400">
                    {h.best_rtt_ms ? `${h.best_rtt_ms}ms` : '-'}
                  </td>

                  {/* Worst */}
                  <td className="py-2.5 text-right text-slate-400">
                    {h.worst_rtt_ms ? `${h.worst_rtt_ms}ms` : '-'}
                  </td>

                  {/* Jitter */}
                  <td className="py-2.5 text-right text-slate-400">
                    {h.stddev_jitter_ms ? `±${h.stddev_jitter_ms}ms` : '-'}
                  </td>

                  {/* Inline Sparkline */}
                  <td className="py-2.5 text-center">
                    <div className="flex items-end justify-center space-x-1 h-4 w-16 mx-auto">
                      {h.sparkline_samples.map((s, idx) => {
                        const hPct = Math.min(Math.max((s / 80) * 100, 20), 100);
                        return (
                          <div
                            key={idx}
                            className={`w-1 rounded-t ${
                              isBottleneck
                                ? 'bg-rose-400'
                                : isCopp
                                ? 'bg-amber-400/60'
                                : isLoss
                                ? 'bg-amber-400'
                                : 'bg-cyan-400'
                            }`}
                            style={{ height: `${hPct}%` }}
                          />
                        );
                      })}
                    </div>
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
