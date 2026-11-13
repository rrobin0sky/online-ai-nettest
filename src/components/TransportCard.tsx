import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, AlertOctagon, ShieldCheck, RefreshCw } from 'lucide-react';
import { TransportTlsMetric } from '../types';

interface TransportCardProps {
  data: TransportTlsMetric | null;
  onBenchmark: () => void;
  isLoading: boolean;
}

export const TransportCard: React.FC<TransportCardProps> = ({ data, onBenchmark, isLoading }) => {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('stage5.title')}
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('stage5.desc')}
              </p>
            </div>
          </div>

          <button
            onClick={onBenchmark}
            disabled={isLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-white bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? t('common.testing') : t('stage5.testHandshake')}</span>
          </button>
        </div>

        <div className="p-8 mt-4 rounded-xl bg-[#080b13] border border-white/[0.06] text-center text-slate-500 font-mono text-xs">
          {t('stage5.notTested', '暂无传输握手数据，点击上方按钮或执行全链路诊断')}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {t('stage5.title')}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {t('stage5.desc')}
            </p>
          </div>
        </div>

        <button
          onClick={onBenchmark}
          disabled={isLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-white bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? t('common.testing') : t('stage5.testHandshake')}</span>
        </button>
      </div>

      {/* Warning */}
      {data.pmtu_blackhole_detected && (
        <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center space-x-2">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            {t('stage5.pmtuBlackholeAlert')}
          </span>
        </div>
      )}

      {/* Grid: TCP Handshake, TLS Handshake, TTFB, PMTU */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {/* TCP Handshake */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06]">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage5.tcpHandshake')}
          </span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-2xl font-bold font-mono text-cyan-400">
              {data.tcp_handshake_ms}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-2 block">
            {t('stage5.tcpSteps')}
          </span>
        </div>

        {/* TLS Handshake */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06]">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage5.tlsNegotiation')}
          </span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {data.tls_handshake_ms}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-2 block truncate">
            {data.tls_version} ({data.cipher_suite})
          </span>
        </div>

        {/* TTFB */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06]">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage5.ttfb')}
          </span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-2xl font-bold font-mono text-indigo-400">
              {data.ttfb_ms}
            </span>
            <span className="text-xs font-mono text-slate-400">ms</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-2 block">
            {t('stage5.ttfbDesc')}
          </span>
        </div>

        {/* Path MTU */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06]">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage5.pathMtu')}
          </span>
          <div className="flex items-baseline space-x-1.5 mt-1.5">
            <span className="text-2xl font-bold font-mono text-white">
              {data.path_mtu}
            </span>
            <span className="text-xs font-mono text-slate-400">bytes</span>
          </div>
          <div className="mt-2 flex items-center space-x-1.5 text-[10px] font-mono">
            {data.pmtu_blackhole_detected ? (
              <span className="text-rose-400 flex items-center gap-1 font-bold">
                <AlertOctagon className="w-3 h-3" /> {t('stage5.blackholeDetected')}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {t('stage5.pmtuHealthy')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
