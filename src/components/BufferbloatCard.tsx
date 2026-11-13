import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { BufferbloatMetric } from '../types';

interface BufferbloatCardProps {
  data: BufferbloatMetric | null;
  onRunTest: () => void;
  isLoading: boolean;
}

export const BufferbloatCard: React.FC<BufferbloatCardProps> = ({ data, onRunTest, isLoading }) => {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('stage4.title')}
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {t('stage4.desc')}
              </p>
            </div>
          </div>

          <button
            onClick={onRunTest}
            disabled={isLoading}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-white bg-violet-600/30 border border-violet-500/40 hover:bg-violet-600/50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? t('common.scanning') : t('stage4.remeasureRpm')}</span>
          </button>
        </div>

        <div className="p-8 mt-4 rounded-xl bg-[#080b13] border border-white/[0.06] text-center text-slate-500 font-mono text-xs">
          {t('stage4.notTested', '暂无测速数据，点击上方按钮或执行全链路诊断')}
        </div>
      </div>
    );
  }

  const isSevere = data.bufferbloat_delta_ms > 80.0;

  const gradeColors: Record<string, string> = {
    'A+': 'text-emerald-400 border-emerald-500/50 bg-emerald-950/40',
    A: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30',
    B: 'text-cyan-300 border-cyan-500/40 bg-cyan-950/30',
    C: 'text-amber-300 border-amber-500/40 bg-amber-950/30',
    D: 'text-orange-400 border-orange-500/40 bg-orange-950/30',
    F: 'text-rose-400 border-rose-500/50 bg-rose-950/40 animate-pulse',
  };

  return (
    <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {t('stage4.title')}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {t('stage4.desc')}
            </p>
          </div>
        </div>

        <button
          onClick={onRunTest}
          disabled={isLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-white bg-violet-600/30 border border-violet-500/40 hover:bg-violet-600/50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? t('common.scanning') : t('stage4.remeasureRpm')}</span>
        </button>
      </div>

      {/* Warning */}
      {isSevere && (
        <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            {t('stage4.severeAlert')} (+{data.bufferbloat_delta_ms}ms)
          </span>
        </div>
      )}

      {/* Grid: Grade Badge & Loaded Latency Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* Big Grade Badge */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono text-slate-500 block uppercase">
              {t('stage4.bufferbloatRating')}
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span
                className={`text-3xl font-black font-mono px-3 py-0.5 rounded-xl border ${
                  gradeColors[data.grade] || 'text-white'
                }`}
              >
                {data.grade}
              </span>
              <span className="text-xs font-mono text-slate-400">
                Grade
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              {t('stage4.queueDelta')}: <span className="text-white font-bold">+{data.bufferbloat_delta_ms} ms</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-mono text-slate-500 block uppercase">
              {t('stage4.appleResponsiveness')}
            </span>
            <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
              {data.rpm}
            </div>
            <span className="text-[10px] font-mono text-slate-400">{t('stage4.rpmUnit')}</span>
          </div>
        </div>

        {/* Latency Deltas */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage4.idleVsLoaded')}
          </span>
          <div className="space-y-2 mt-2 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t('stage4.unloadedRtt')}:</span>
              <span className="text-emerald-400 font-bold">{data.unloaded_latency_ms} ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t('stage4.loadedDlRtt')}:</span>
              <span className="text-amber-400 font-bold">{data.loaded_download_latency_ms} ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t('stage4.loadedUlRtt')}:</span>
              <span className="text-rose-400 font-bold">{data.loaded_upload_latency_ms} ms</span>
            </div>
          </div>
        </div>

        {/* Throughput */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 block uppercase">
            {t('stage4.saturationBandwidth')}
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-2">
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.04]">
              <span className="text-[10px] text-slate-500 block">{t('stage4.download')}</span>
              <span className="text-lg font-bold text-cyan-300">
                {data.download_bandwidth_mbps ?? '-'}
              </span>
              <span className="text-[10px] text-slate-500 ml-1">Mbps</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.04]">
              <span className="text-[10px] text-slate-500 block">{t('stage4.upload')}</span>
              <span className="text-lg font-bold text-violet-300">
                {data.upload_bandwidth_mbps ?? '-'}
              </span>
              <span className="text-[10px] text-slate-500 ml-1">Mbps</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
