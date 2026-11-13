import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DnsBenchmarkResult, ProxyTopologyInfo } from '../types';

interface DnsBenchmarkCardProps {
  dns: DnsBenchmarkResult[];
  proxy: ProxyTopologyInfo | null;
  targetDomain: string;
  onTargetDomainChange: (domain: string) => void;
  onBenchmark: () => void;
  isLoading: boolean;
}

export const DnsBenchmarkCard: React.FC<DnsBenchmarkCardProps> = ({
  dns,
  proxy,
  targetDomain,
  onTargetDomainChange,
  onBenchmark,
  isLoading,
}) => {
  const { t } = useTranslation();
  const hasGeoMismatch = dns.some((d) => d.geo_mismatch);
  const sysDns = dns.find((d) => d.is_system_default);
  const isCongested =
    sysDns?.latency_ms &&
    sysDns.latency_ms > 60.0 &&
    dns.some((d) => !d.is_system_default && d.latency_ms && d.latency_ms < 25.0);

  return (
    <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              {t('stage2.title')}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {t('stage2.desc')}
            </p>
          </div>
        </div>

        {/* Target domain query input */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <input
              type="text"
              value={targetDomain}
              onChange={(e) => onTargetDomainChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#080b13] border border-white/[0.1] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-44"
              placeholder={t('stage2.fqdnPlaceholder')}
            />
          </div>
          <button
            onClick={onBenchmark}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-xs font-mono text-indigo-200 hover:bg-indigo-600/50 transition-colors cursor-pointer"
          >
            {isLoading ? t('common.testing') : t('stage2.benchmark')}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {isCongested && (
        <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{t('stage2.congestedWarn')}</span>
        </div>
      )}

      {hasGeoMismatch && (
        <div className="mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{t('stage2.splitHorizonWarn')}</span>
        </div>
      )}

      {/* Main Grid: Proxy Status & DNS Benchmark Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Left: Proxy Topology Card */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2.5">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                {t('stage2.macosProxy')}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  proxy?.proxy_enabled
                    ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {proxy?.proxy_enabled ? t('stage2.intercepted') : t('stage2.directPass')}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">{t('stage2.httpProxy')}</span>
                <span className="text-slate-200">{proxy?.http_proxy || 'None'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">{t('stage2.httpsProxy')}</span>
                <span className="text-slate-200">{proxy?.https_proxy || 'None'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/[0.04]">
                <span className="text-slate-500">{t('stage2.socksProxy')}</span>
                <span className="text-slate-200">{proxy?.socks_proxy || 'None'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">{t('stage2.pacAuto')}</span>
                <span className="text-slate-200 truncate max-w-[150px]">{proxy?.pac_url || t('stage2.disabled')}</span>
              </div>
            </div>
          </div>

          {proxy?.bypass_list && proxy.bypass_list.length > 0 && (
            <div className="mt-3 pt-2 border-t border-white/[0.06] text-[10px] font-mono text-slate-400">
              <span className="text-slate-500 block mb-1">{t('stage2.bypassDomains')}:</span>
              <p className="truncate text-slate-300">{proxy.bypass_list.slice(0, 4).join(', ')}</p>
            </div>
          )}
        </div>

        {/* Right: Multi-Resolver Comparison Table */}
        <div className="lg:col-span-2 p-4 rounded-xl bg-[#080b13] border border-white/[0.06] overflow-x-auto">
          <div className="text-xs font-mono text-slate-400 mb-2.5 flex items-center justify-between">
            <span>{t('stage2.resolverBenchmark')} ({targetDomain})</span>
            <span className="text-slate-500 text-[10px]">{t('stage2.responseTime')}</span>
          </div>

          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] text-slate-500 text-[11px]">
                <th className="pb-2 font-normal">{t('stage2.resolver')}</th>
                <th className="pb-2 font-normal">{t('stage2.ip')}</th>
                <th className="pb-2 font-normal">{t('stage2.latency')}</th>
                <th className="pb-2 font-normal">{t('stage2.status')}</th>
                <th className="pb-2 font-normal">{t('stage2.resolvedRecords')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {dns.map((res, idx) => {
                const maxLatency = 80;
                const latVal = res.latency_ms ?? 0;
                const barWidth = Math.min((latVal / maxLatency) * 100, 100);

                return (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 font-medium text-white flex items-center gap-1.5">
                      {res.is_system_default && (
                        <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[9px]">
                          DEFAULT
                        </span>
                      )}
                      <span>{res.resolver_name}</span>
                    </td>
                    <td className="py-2.5 text-slate-400">{res.resolver_ip}</td>
                    <td className="py-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-emerald-400 w-12 text-right">
                          {res.latency_ms ? `${res.latency_ms}ms` : 'Timeout'}
                        </span>
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              latVal > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5">
                      {res.status === 'SUCCESS' ? (
                        <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="w-3 h-3" /> FAIL
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-300 truncate max-w-[180px]">
                      {res.resolved_ips.length > 0 ? res.resolved_ips.join(', ') : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
