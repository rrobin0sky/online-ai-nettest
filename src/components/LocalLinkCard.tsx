import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wifi,
  Radio,
  Server,
  Activity,
  AlertTriangle,
  Gauge,
} from 'lucide-react';
import { WiFiInterfaceInfo, SignalQualityRating } from '../types';

interface LocalLinkCardProps {
  data: WiFiInterfaceInfo | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export const LocalLinkCard: React.FC<LocalLinkCardProps> = ({ data, onRefresh, isLoading }) => {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="bg-[#0f1423] rounded-2xl border border-white/[0.08] p-6 text-center text-slate-400 font-mono text-xs">
        {t('common.scanning')}
      </div>
    );
  }

  const snr = data.snr_db ?? 0;
  const rssi = data.rssi_dbm ?? -90;
  const noise = data.noise_dbm ?? -95;

  // Signal gauge percentage (SNR 0 to 60 dB)
  const snrPercentage = Math.min(Math.max((snr / 60) * 100, 5), 100);

  const qualityColor: Record<SignalQualityRating, string> = {
    EXCELLENT: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40',
    GOOD: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40',
    FAIR: 'text-amber-400 bg-amber-950/60 border-amber-500/40',
    POOR: 'text-rose-400 bg-rose-950/60 border-rose-500/40',
    CRITICAL: 'text-rose-300 bg-rose-900/80 border-rose-500/60 animate-pulse',
  };

  const qualityKey = data.signal_quality.toLowerCase();
  const qualityText = t(`common.${qualityKey}`, { defaultValue: data.signal_quality });

  return (
    <div className="bg-[#0c101c]/90 rounded-2xl border border-white/[0.08] p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.08] gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Wifi className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {t('stage1.title')}
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161f36] text-cyan-300 border border-white/[0.08]">
                {data.interface_name}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {t('stage1.desc')}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg border ${qualityColor[data.signal_quality]}`}>
            {qualityText}
          </span>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-[#151c30] border border-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title={t('nav.refreshMetrics')}
          >
            <Activity className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* TUN / VPN Bypass Banner */}
      {data.is_tunnel_active && (
        <div className="mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-mono flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span>
              {t('baseline.tunnelActive', '检测到虚拟网络隧道 (TUN/VPN)')}: <strong>{data.tunnel_interface || 'utun'}</strong>
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] font-bold">
            {data.is_physical_bypass_active
              ? `直通物理链路: ${data.physical_interface || 'en0'} → ${data.physical_gateway || data.gateway_ip}`
              : '经由虚拟隧道'}
          </span>
        </div>
      )}

      {/* Warnings Banner if any */}
      {data.diagnosis_flags.length > 0 && (
        <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono space-y-1">
          {data.diagnosis_flags.map((flag, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid: RF Gauges & Link Specs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {/* RF Signal & SNR Gauge */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              {t('stage1.snrRf')}
            </span>
            <span className="text-emerald-400 font-bold">{snr} dB SNR</span>
          </div>

          {/* SNR Progress Bar */}
          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden my-2 relative">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-400 via-cyan-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${snrPercentage}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-2 pt-2 border-t border-white/[0.06]">
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.rssi')}</span>
              <span className="text-white font-bold">{rssi} dBm</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.noiseFloor')}</span>
              <span className="text-white font-bold">{noise} dBm</span>
            </div>
          </div>
        </div>

        {/* 802.11 Modulation & Rates */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06]">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              {t('stage1.wifiSpecs')}
            </span>
            <span className="text-indigo-300 font-semibold">{data.standard_generation || 'Wi-Fi 6'}</span>
          </div>

          <div className="grid grid-cols-2 gap-y-2.5 gap-x-2 text-xs font-mono mt-3">
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.phyMode')}</span>
              <span className="text-white font-medium">{data.phy_mode || '802.11ax'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.chWidth')}</span>
              <span className="text-white font-medium">
                CH {data.channel ?? '-'} ({data.channel_width_mhz ?? 20}MHz)
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.currentMcs')}</span>
              <span className="text-cyan-300 font-bold">Index {data.mcs_index ?? '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">{t('stage1.txRate')}</span>
              <span className="text-emerald-400 font-bold">{data.tx_rate_mbps ?? '-'} Mbps</span>
            </div>
          </div>
        </div>

        {/* Default Gateway & Jitter */}
        <div className="p-4 rounded-xl bg-[#080b13] border border-white/[0.06] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-400" />
                {t('stage1.gatewayProbing')}
              </span>
              <span className="text-emerald-400 font-mono font-semibold">
                {t('stage1.jitter')}: {data.gateway_jitter_ms ?? 0} ms
              </span>
            </div>

            <div className="flex items-baseline justify-between text-xs font-mono mt-1">
              <div>
                <span className="text-slate-500 block text-[10px]">{t('stage1.gatewayIp')}</span>
                <span className="text-white font-bold">{data.gateway_ip || '192.168.1.1'}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">{t('stage1.avgRtt')}</span>
                <span className="text-cyan-400 font-bold text-sm">{data.gateway_rtt_avg_ms ?? '-'} ms</span>
              </div>
            </div>
          </div>

          {/* 10 continuous samples sparkline visualization */}
          <div className="mt-3 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
              <span>{t('stage1.samples10pkts')}</span>
              <span>{t('stage1.loss')}: {data.gateway_packet_loss_pct}%</span>
            </div>
            <div className="flex items-end space-x-1 h-7">
              {data.gateway_rtt_samples.map((sample, idx) => {
                const maxVal = Math.max(...data.gateway_rtt_samples, 15);
                const barHeight = Math.min(Math.max((sample / maxVal) * 100, 15), 100);
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-cyan-500/40 hover:bg-cyan-400 rounded-t transition-all group relative"
                    style={{ height: `${barHeight}%` }}
                  >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black px-1 py-0.5 rounded text-[9px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {sample}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Subnet & BSSID Metadata Bar */}
      <div className="mt-3.5 px-4 py-2.5 rounded-xl bg-[#080b13] border border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
        <div className="flex items-center space-x-2">
          <span>{t('stage1.ssid')}:</span>
          <span className="text-white font-medium">{data.ssid || 'None'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span>{t('stage1.bssid')}:</span>
          <span className="text-indigo-300">{data.bssid || data.gateway_mac || 'Unknown'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span>{t('stage1.localIpSubnet')}:</span>
          <span className="text-slate-200">
            {data.ip_address || 'DHCP'} / {data.subnet_mask || '255.255.255.0'}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span>{t('stage1.hwMac')}:</span>
          <span className="text-slate-300">{data.mac_address}</span>
        </div>
      </div>
    </div>
  );
};
