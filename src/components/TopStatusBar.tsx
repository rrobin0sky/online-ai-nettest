import React from 'react';
import {
  Wifi,
  Radio,
  Server,
  ShieldCheck,
  ShieldAlert,
  Play,
  DownloadCloud,
  RefreshCw,
  Layers,
  Sparkles,
  Settings,
  Languages,
  History,
  Star,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WiFiInterfaceInfo, ProxyTopologyInfo } from '../types';
import { setAppLanguage } from '../i18n';

interface TopStatusBarProps {
  link: WiFiInterfaceInfo | null;
  proxy: ProxyTopologyInfo | null;
  isScanning: boolean;
  onRunDiagnostics: () => void;
  onOpenExport: () => void;
  onOpenAiAnalysis: () => void;
  onOpenAiSettings: () => void;
  onOpenHistory: () => void;
  historyCount: number;
  lastUpdated: string | null;
  // Tunnel Bypass
  bypassTunnel?: boolean;
  onToggleBypassTunnel?: () => void;
  // Golden Baseline
  hasGoldenBaseline?: boolean;
  goldenBaselineLabel?: string;
  onOpenBaselineDiff?: () => void;
  onPinCurrentAsBaseline?: () => void;
}

export const TopStatusBar: React.FC<TopStatusBarProps> = ({
  link,
  proxy,
  isScanning,
  onRunDiagnostics,
  onOpenExport,
  onOpenAiAnalysis,
  onOpenAiSettings,
  onOpenHistory,
  historyCount,
  lastUpdated,
  bypassTunnel = true,
  onToggleBypassTunnel,
  hasGoldenBaseline = false,
  goldenBaselineLabel,
  onOpenBaselineDiff,
  onPinCurrentAsBaseline,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language.startsWith('zh') ? 'zh-CN' : 'en';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'zh-CN' ? 'en' : 'zh-CN';
    setAppLanguage(nextLang);
  };

  const isTunnelActive = link?.is_tunnel_active;
  const isPhysicalBypass = link?.is_physical_bypass_active ?? bypassTunnel;

  return (
    <header className="sticky top-0 z-40 bg-[#07090e]/90 backdrop-blur-md border-b border-white/[0.08] px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-violet-500 p-[1.5px] shadow-lg shadow-indigo-500/20">
          <div className="w-full h-full bg-[#0a0d14] rounded-[10px] flex items-center justify-center">
            <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              {t('app.title')}
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-semibold tracking-wider">
                {t('app.badge')}
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            {t('app.subtitle')}
            {lastUpdated && <span className="text-slate-500 ml-2">({lastUpdated})</span>}
          </p>
        </div>
      </div>

      {/* Real-time Hardware & Egress Telemetry Chips */}
      <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
        {/* Active Interface */}
        <div className="flex items-center space-x-1.5 bg-[#0e1322] border border-white/[0.08] px-2.5 py-1.5 rounded-lg shadow-sm">
          <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">{t('nav.interface')}:</span>
          <span className="text-white font-medium">
            {link ? `${link.interface_name} (${link.standard_generation || link.interface_type})` : t('common.scanning')}
          </span>
        </div>

        {/* BSSID & Channel */}
        <div className="hidden sm:flex items-center space-x-1.5 bg-[#0e1322] border border-white/[0.08] px-2.5 py-1.5 rounded-lg">
          <Radio className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-slate-400">{t('nav.chMcs')}:</span>
          <span className="text-white font-medium">
            {link?.channel ? `CH ${link.channel} (${link.channel_band || '2.4G'}) / MCS ${link.mcs_index ?? '-'}` : 'N/A'}
          </span>
        </div>

        {/* Gateway */}
        <div className="hidden md:flex items-center space-x-1.5 bg-[#0e1322] border border-white/[0.08] px-2.5 py-1.5 rounded-lg">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">{t('nav.gateway')}:</span>
          <span className="text-white font-medium">
            {link?.gateway_ip ? `${link.gateway_ip} (${link.gateway_rtt_avg_ms ?? '-'}ms)` : '...'}
          </span>
        </div>

        {/* TUN / VPN Active & Physical Bypass Chip */}
        {isTunnelActive && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="font-semibold text-[11px]">TUN: {link?.tunnel_interface || 'utun'}</span>
            <span className="text-amber-500/60">|</span>
            <span className="text-amber-200/90 text-[11px]">
              {isPhysicalBypass
                ? `Bypass: ${link?.physical_interface || 'en0'} → ${link?.physical_gateway || link?.gateway_ip}`
                : 'Tunnel Mode'}
            </span>
            {onToggleBypassTunnel && (
              <button
                type="button"
                onClick={onToggleBypassTunnel}
                className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 border border-amber-500/40 transition-colors cursor-pointer"
                title={isPhysicalBypass ? '点击切换为经由虚拟隧道探测' : '点击切换为物理网卡直通探测'}
              >
                {isPhysicalBypass ? '直连中' : '隧道中'}
              </button>
            )}
          </div>
        )}

        {/* Proxy Status */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border ${
            proxy?.proxy_enabled
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {proxy?.proxy_enabled ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('nav.proxyActive')}: {proxy.http_proxy || proxy.socks_proxy || 'ACTIVE'}</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('nav.directPass')}</span>
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        {/* Language Switcher Pill */}
        <button
          onClick={toggleLanguage}
          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 bg-[#121829] border border-white/[0.12] hover:bg-[#1a233b] hover:text-white transition-colors cursor-pointer"
          title="Switch Language / 切换语言"
        >
          <Languages className="w-3.5 h-3.5 text-cyan-400" />
          <span>{currentLang === 'zh-CN' ? '中' : 'EN'}</span>
        </button>

        {/* Golden Baseline Action Button */}
        {hasGoldenBaseline ? (
          <button
            onClick={onOpenBaselineDiff}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-amber-300 bg-amber-950/50 border border-amber-500/50 hover:bg-amber-900/60 transition-all cursor-pointer shadow-sm shadow-amber-950"
            title={t('baseline.diffTitle', '与黄金基线对比')}
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="truncate max-w-[120px]">{goldenBaselineLabel || t('nav.goldenBaseline', '黄金基线')}</span>
          </button>
        ) : (
          onPinCurrentAsBaseline && (
            <button
              onClick={onPinCurrentAsBaseline}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 bg-[#121829] border border-white/[0.12] hover:bg-[#1a233b] hover:text-white transition-colors cursor-pointer"
              title={t('baseline.pinButton', '锁为黄金基线')}
            >
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('nav.pinBaseline', '锁定基线')}</span>
            </button>
          )
        )}

        {/* History Button with Count Badge */}
        <button
          onClick={onOpenHistory}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-slate-300 bg-[#121829] border border-white/[0.12] hover:bg-[#1a233b] hover:text-white transition-colors cursor-pointer"
          title={t('nav.history')}
        >
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t('nav.history')}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-cyan-950 border border-cyan-500/40 text-cyan-300">
            {historyCount}/10
          </span>
        </button>

        {/* AI Analyze Action Button */}
        <button
          onClick={onOpenAiAnalysis}
          className="relative inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 transition-all duration-200 shadow-md shadow-violet-600/30 hover:shadow-cyan-500/40 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
          <span>{t('nav.aiAnalysis')}</span>
        </button>

        {/* Regular Run Button */}
        <button
          onClick={onRunDiagnostics}
          disabled={isScanning}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-[#141b2e] border border-white/[0.12] hover:bg-[#1a233b] hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{t('common.scanning')}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current text-cyan-400" />
              <span>{t('nav.refreshMetrics')}</span>
            </>
          )}
        </button>

        {/* Export Button */}
        <button
          onClick={onOpenExport}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer border border-white/[0.08]"
          title={t('nav.exportReport')}
        >
          <DownloadCloud className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenAiSettings}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer border border-white/[0.08]"
          title={t('nav.settings')}
        >
          <Settings className="w-4 h-4 text-slate-300" />
        </button>
      </div>
    </header>
  );
};
