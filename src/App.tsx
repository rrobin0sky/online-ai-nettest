import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TopStatusBar } from './components/TopStatusBar';
import { PipelineProgress } from './components/PipelineProgress';
import { RcaBanner } from './components/RcaBanner';
import { LocalLinkCard } from './components/LocalLinkCard';
import { DnsBenchmarkCard } from './components/DnsBenchmarkCard';
import { MtrTable } from './components/MtrTable';
import { BufferbloatCard } from './components/BufferbloatCard';
import { TransportCard } from './components/TransportCard';
import { ExportReportModal } from './components/ExportReportModal';
import { AiConfigModal } from './components/AiConfigModal';
import { AiAnalysisDrawer } from './components/AiAnalysisDrawer';
import { HistoryModal } from './components/HistoryModal';
import { BaselineDiffModal } from './components/BaselineDiffModal';
import { PinBaselineModal } from './components/PinBaselineModal';
import {
  CompleteDiagnosticReport,
  WiFiInterfaceInfo,
  ProxyTopologyInfo,
  DnsBenchmarkResult,
  MtrHopResult,
  BufferbloatMetric,
  TransportTlsMetric,
  DiagnosticSummary,
  DiagnosticSnapshot,
} from './types';
import { AiConfig } from './types/ai';
import { loadAiConfig, saveAiConfig } from './services/aiConfig';
import { useHistoryStore } from './services/historyStore';
import { useGoldenBaseline } from './services/baselineStore';
import { computeBaselineDiff, BaselineDiffResult } from './services/baselineDiff';
import {
  fetchStage1Link,
  fetchStage2Proxy,
  fetchStage2Dns,
  fetchStage3Mtr,
  fetchStage4Bufferbloat,
  fetchStage5Transport,
  runFullDiagnosticPipeline,
  isTauriEnvironment,
} from './services/tauri-bridge';
import { IncidentReport } from './types';
import { Layers, LayoutGrid, History, ArrowLeft, Sparkles, GitCompare, Star } from 'lucide-react';

export default function App() {
  const { t } = useTranslation();
  const historyStore = useHistoryStore();
  const [selectedStage, setSelectedStage] = useState<number>(0); // 0 = View All
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [isAiConfigOpen, setIsAiConfigOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [activeSnapshot, setActiveSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Tunnel Bypass & Golden Baseline State
  const [bypassTunnel, setBypassTunnel] = useState<boolean>(true);
  const { baseline, hasBaseline, pinBaseline, unpinBaseline } = useGoldenBaseline();
  const [isBaselineDiffOpen, setIsBaselineDiffOpen] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pinTargetSnapshot, setPinTargetSnapshot] = useState<DiagnosticSnapshot | null>(null);

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState<AiConfig>(loadAiConfig());

  // Diagnostic State
  const [linkInfo, setLinkInfo] = useState<WiFiInterfaceInfo | null>(null);
  const [proxyInfo, setProxyInfo] = useState<ProxyTopologyInfo | null>(null);
  const [dnsResults, setDnsResults] = useState<DnsBenchmarkResult[]>([]);
  const [mtrHops, setMtrHops] = useState<MtrHopResult[]>([]);
  const [bufferbloat, setBufferbloat] = useState<BufferbloatMetric | null>(null);
  const [transport, setTransport] = useState<TransportTlsMetric | null>(null);
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);

  // Targets
  const [dnsTarget, setDnsTarget] = useState<string>('www.aliyun.com');
  const [mtrTargetName, setMtrTargetName] = useState<string>('AliCloud East (BGP)');
  const [mtrTargetHost, setMtrTargetHost] = useState<string>('223.5.5.5');

  // Loading states
  const [isStage1Loading, setIsStage1Loading] = useState<boolean>(false);
  const [isDnsLoading, setIsDnsLoading] = useState<boolean>(false);
  const [isMtrLoading, setIsMtrLoading] = useState<boolean>(false);
  const [isBufferbloatLoading, setIsBufferbloatLoading] = useState<boolean>(false);
  const [isTransportLoading, setIsTransportLoading] = useState<boolean>(false);

  // Initial load: lightweight status fetch; do NOT auto-run full diagnostics
  useEffect(() => {
    // 1. If prior snapshots exist, load the most recent snapshot into view
    const existing = historyStore.snapshots;
    if (existing && existing.length > 0) {
      const latest = existing[0];
      setLinkInfo(latest.rawTelemetry.stage1_link);
      setProxyInfo(latest.rawTelemetry.stage2_proxy);
      setDnsResults(latest.rawTelemetry.stage2_dns);
      setMtrHops(latest.rawTelemetry.stage3_mtr);
      setBufferbloat(latest.rawTelemetry.stage4_bufferbloat);
      setTransport(latest.rawTelemetry.stage5_transport);
      setSummary(latest.rawTelemetry.summary);
      setLastUpdated(new Date(latest.timestamp).toLocaleTimeString());
    }

    // 2. Fetch fresh real-time interface, Wi-Fi, and proxy status without running heavy diagnostics
    fetchStage1Link(bypassTunnel)
      .then((link) => setLinkInfo(link))
      .catch((err) => console.error('Failed to probe Stage 1 link on launch:', err));
    fetchStage2Proxy()
      .then((proxy) => setProxyInfo(proxy))
      .catch((err) => console.error('Failed to probe Stage 2 proxy on launch:', err));
  }, []);

  // Listen for Sentinel incidents and Menu Bar trigger events from Rust backend
  useEffect(() => {
    let unlistenIncident: (() => void) | undefined;
    let unlistenSnapshot: (() => void) | undefined;

    if (isTauriEnvironment()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<IncidentReport>('sentinel-incident', (event) => {
          const inc = event.payload;
          handleRunFullDiagnostics(inc.trigger_reason, inc.trigger_description);
        }).then((un) => {
          unlistenIncident = un;
        });

        listen('sentinel-trigger-snapshot', () => {
          handleRunFullDiagnostics('MANUAL', '从 macOS 菜单栏手动触发快照');
        }).then((un) => {
          unlistenSnapshot = un;
        });
      });
    }

    return () => {
      unlistenIncident?.();
      unlistenSnapshot?.();
    };
  }, [dnsTarget, mtrTargetHost, bypassTunnel]);

  const handleRunFullDiagnostics = async (
    triggerReason?: DiagnosticSnapshot['triggerReason'],
    triggerDescription?: string
  ) => {
    setIsScanning(true);
    try {
      const report = await runFullDiagnosticPipeline(dnsTarget, mtrTargetHost, bypassTunnel);
      setLinkInfo(report.stage1_link);
      setProxyInfo(report.stage2_proxy);
      setDnsResults(report.stage2_dns);
      setMtrHops(report.stage3_mtr);
      setBufferbloat(report.stage4_bufferbloat);
      setTransport(report.stage5_transport);
      setSummary(report.summary);
      setLastUpdated(new Date().toLocaleTimeString());
      setActiveSnapshot(null);

      // Automatically persist to 10-snapshot FIFO history store
      historyStore.addSnapshot(
        report,
        `DNS: ${dnsTarget} | MTR: ${mtrTargetName} (${mtrTargetHost})`,
        triggerReason,
        triggerDescription
      );
    } catch (err) {
      console.error('Failed to run diagnostics pipeline:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRefreshStage1 = async (overrideBypass?: boolean) => {
    setIsStage1Loading(true);
    const bypass = overrideBypass ?? bypassTunnel;
    try {
      const link = await fetchStage1Link(bypass);
      setLinkInfo(link);
    } catch (err) {
      console.error('Stage 1 refresh failed:', err);
    } finally {
      setIsStage1Loading(false);
    }
  };

  const handleToggleBypassTunnel = () => {
    const nextBypass = !bypassTunnel;
    setBypassTunnel(nextBypass);
    handleRefreshStage1(nextBypass);
  };

  const handleBenchmarkDns = async () => {
    setIsDnsLoading(true);
    try {
      const results = await fetchStage2Dns(dnsTarget);
      setDnsResults(results);
    } catch (err) {
      console.error('DNS benchmark failed:', err);
    } finally {
      setIsDnsLoading(false);
    }
  };

  const handleRunMtr = async (protocol?: 'ICMP' | 'TCP') => {
    setIsMtrLoading(true);
    try {
      const hops = await fetchStage3Mtr(mtrTargetName, mtrTargetHost, protocol);
      setMtrHops(hops);
    } catch (err) {
      console.error('MTR execution failed:', err);
    } finally {
      setIsMtrLoading(false);
    }
  };

  const handleMeasureBufferbloat = async () => {
    setIsBufferbloatLoading(true);
    try {
      const res = await fetchStage4Bufferbloat();
      setBufferbloat(res);
    } catch (err) {
      console.error('Bufferbloat test failed:', err);
    } finally {
      setIsBufferbloatLoading(false);
    }
  };

  const handleBenchmarkTransport = async () => {
    setIsTransportLoading(true);
    try {
      const res = await fetchStage5Transport(dnsTarget, 443);
      setTransport(res);
    } catch (err) {
      console.error('Transport benchmark failed:', err);
    } finally {
      setIsTransportLoading(false);
    }
  };

  const handleSaveAiConfig = (newConfig: AiConfig) => {
    setAiConfig(newConfig);
    saveAiConfig(newConfig);
  };

  const liveReport: CompleteDiagnosticReport | null =
    linkInfo && proxyInfo && bufferbloat && transport && summary
      ? {
          stage1_link: linkInfo,
          stage2_proxy: proxyInfo,
          stage2_dns: dnsResults,
          stage3_mtr: mtrHops,
          stage4_bufferbloat: bufferbloat,
          stage5_transport: transport,
          summary,
        }
      : null;

  const currentReport: CompleteDiagnosticReport | null = activeSnapshot
    ? activeSnapshot.rawTelemetry
    : liveReport;

  // Compute multi-layer differential against Golden Baseline whenever available
  const baselineDiff = useMemo<BaselineDiffResult | null>(() => {
    if (!baseline || !currentReport) return null;
    return computeBaselineDiff(baseline.snapshot.rawTelemetry, currentReport, {
      label: baseline.label,
      pinnedAt: baseline.pinnedAt,
      id: baseline.id,
    });
  }, [baseline, currentReport]);

  const handlePinCurrentAsBaseline = () => {
    if (!currentReport) return;
    const sysDns =
      currentReport.stage2_dns.find((d) => d.is_system_default) || currentReport.stage2_dns[0];
    const maxLoss =
      currentReport.stage3_mtr.length > 0
        ? Math.max(...currentReport.stage3_mtr.map((h) => h.loss_pct), 0)
        : 0;

    const snap: DiagnosticSnapshot = {
      id: currentReport.summary.id || `snap_${Date.now()}`,
      timestamp: Date.now(),
      targetSummary: `DNS: ${dnsTarget} | MTR: ${mtrTargetName} (${mtrTargetHost})`,
      overallStatus: currentReport.summary.overall_severity || 'NORMAL',
      keyMetrics: {
        gatewayRtt: currentReport.stage1_link.gateway_rtt_avg_ms ?? 0,
        gatewayJitter: currentReport.stage1_link.gateway_jitter_ms ?? 0,
        localDnsRtt: sysDns?.latency_ms ?? 0,
        bufferbloatGrade: currentReport.stage4_bufferbloat.grade || 'N/A',
        maxHopLossRate: maxLoss,
        ttfb: currentReport.stage5_transport.ttfb_ms ?? 0,
      },
      rawTelemetry: currentReport,
    };
    setPinTargetSnapshot(snap);
    setIsPinModalOpen(true);
  };

  const displayedLink = currentReport?.stage1_link ?? linkInfo;
  const displayedProxy = currentReport?.stage2_proxy ?? proxyInfo;
  const displayedDns = currentReport?.stage2_dns ?? dnsResults;
  const displayedMtr = currentReport?.stage3_mtr ?? mtrHops;
  const displayedBufferbloat = currentReport?.stage4_bufferbloat ?? bufferbloat;
  const displayedTransport = currentReport?.stage5_transport ?? transport;
  const displayedSummary = currentReport?.summary ?? summary;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Telemetry Status Bar */}
      <TopStatusBar
        link={displayedLink}
        proxy={displayedProxy}
        isScanning={isScanning}
        onRunDiagnostics={handleRunFullDiagnostics}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAiAnalysis={() => setIsAiDrawerOpen(true)}
        onOpenAiSettings={() => setIsAiConfigOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={historyStore.count}
        lastUpdated={lastUpdated}
        bypassTunnel={bypassTunnel}
        onToggleBypassTunnel={handleToggleBypassTunnel}
        hasGoldenBaseline={hasBaseline}
        goldenBaselineLabel={baseline?.label}
        onOpenBaselineDiff={() => setIsBaselineDiffOpen(true)}
        onPinCurrentAsBaseline={handlePinCurrentAsBaseline}
      />

      {/* Main High-Density Workspace */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Active Historical Snapshot Replay Banner */}
        {activeSnapshot && (
          <div className="p-3.5 rounded-2xl bg-cyan-950/60 border border-cyan-500/50 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-xl backdrop-blur-md">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                <History className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {t('history.viewingBanner')}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-900/80 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold">
                    {new Date(activeSnapshot.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  {activeSnapshot.targetSummary}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => setIsAiDrawerOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 transition-colors cursor-pointer shadow-md shadow-cyan-950/50"
              >
                <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                <span>{t('history.askAi')}</span>
              </button>
              <button
                onClick={() => setActiveSnapshot(null)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer border border-white/[0.08]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('history.exitInspection')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Golden Baseline Overview Card when baseline exists */}
        {hasBaseline && baselineDiff && (
          <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-lg backdrop-blur-md">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <Star className="w-4 h-4 fill-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {t('baseline.goldenBaseline', '黄金基线')}: {baseline?.label}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      baselineDiff.overallHealthStatus === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border border-rose-500/50'
                        : baselineDiff.overallHealthStatus === 'DEGRADED'
                        ? 'bg-amber-950 text-amber-300 border border-amber-500/50'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                    }`}
                  >
                    {baselineDiff.summaryHeadline}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  {t('stage1.avgRtt', '网关 RTT')}: {baselineDiff.kpis.gatewayRtt.formattedDelta} | {t('stage2.systemDns', 'DNS')}: {baselineDiff.kpis.dnsLatency.formattedDelta} | {t('baseline.hops', '跳数')}: {baselineDiff.topology.hopCountDelta >= 0 ? `+${baselineDiff.topology.hopCountDelta}` : baselineDiff.topology.hopCountDelta}
                  {baselineDiff.topology.asnDiff.isRouteShiftDetected && (
                    <span className="text-amber-400 ml-1.5 font-bold">
                      | ⚠️ {t('baseline.asnShiftDetected', 'ASN 路由路径发生偏移')}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsBaselineDiffOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-200 bg-amber-900/50 hover:bg-amber-800/70 border border-amber-500/40 transition-colors cursor-pointer"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>{t('baseline.diffTitle', '查看多维差异明细')}</span>
              </button>
            </div>
          </div>
        )}

        {/* RCA Summary Card */}
        <RcaBanner
          summary={displayedSummary}
          onOpenAiAnalysis={() => setIsAiDrawerOpen(true)}
        />

        {/* 5-Stage Interactive Pipeline Stepper & Mode Switcher */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              {t('pipeline.enterprisePipeline')}
            </span>

            <div className="bg-[#0e1322] p-0.5 rounded-lg border border-white/[0.08] flex items-center text-xs font-mono">
              <button
                onClick={() => setSelectedStage(0)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  selectedStage === 0
                    ? 'bg-cyan-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{t('pipeline.allStages')}</span>
              </button>
            </div>
          </div>

          <PipelineProgress
            currentStage={selectedStage}
            onSelectStage={(st) => setSelectedStage(st)}
            affectedStages={displayedSummary?.affected_stages || []}
            overallSeverity={displayedSummary?.overall_severity || 'NORMAL'}
          />
        </div>

        {/* Diagnostic Stage Modules View */}
        <div className="space-y-6">
          {/* Stage 1: macOS Local Link & Wi-Fi */}
          {(selectedStage === 0 || selectedStage === 1) && (
            <LocalLinkCard
              data={displayedLink}
              onRefresh={handleRefreshStage1}
              isLoading={isStage1Loading}
            />
          )}

          {/* Stage 2: DNS & Proxy Topology */}
          {(selectedStage === 0 || selectedStage === 2) && (
            <DnsBenchmarkCard
              dns={displayedDns}
              proxy={displayedProxy}
              targetDomain={dnsTarget}
              onTargetDomainChange={(d) => setDnsTarget(d)}
              onBenchmark={handleBenchmarkDns}
              isLoading={isDnsLoading}
            />
          )}

          {/* Stage 3: WAN Backbone MTR */}
          {(selectedStage === 0 || selectedStage === 3) && (
            <MtrTable
              hops={displayedMtr}
              currentTargetHost={mtrTargetHost}
              onSelectTarget={(name, host) => {
                setMtrTargetName(name);
                setMtrTargetHost(host);
              }}
              onRunMtr={handleRunMtr}
              isLoading={isMtrLoading}
            />
          )}

          {/* Stage 4: Bufferbloat & Loaded Latency */}
          {(selectedStage === 0 || selectedStage === 4) && (
            <BufferbloatCard
              data={displayedBufferbloat}
              onRunTest={handleMeasureBufferbloat}
              isLoading={isBufferbloatLoading}
            />
          )}

          {/* Stage 5: Transport & TLS Performance */}
          {(selectedStage === 0 || selectedStage === 5) && (
            <TransportCard
              data={displayedTransport}
              onBenchmark={handleBenchmarkTransport}
              isLoading={isTransportLoading}
            />
          )}
        </div>
      </main>

      {/* One-Click Tech Support Export Modal */}
      <ExportReportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        report={currentReport}
      />

      {/* Diagnostic History Modal (10 Snapshots FIFO) */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        snapshots={historyStore.snapshots}
        currentLiveReport={liveReport}
        activeSnapshotId={activeSnapshot?.id ?? null}
        onInspectSnapshot={(snap) => setActiveSnapshot(snap)}
        onDeleteSnapshot={(id) => {
          if (activeSnapshot?.id === id) setActiveSnapshot(null);
          historyStore.deleteSnapshot(id);
        }}
        onClearHistory={() => {
          setActiveSnapshot(null);
          historyStore.clearHistory();
        }}
        onOpenAiWithSnapshot={(snap) => {
          setActiveSnapshot(snap);
          setIsAiDrawerOpen(true);
        }}
        onPinAsBaseline={(snap) => {
          setPinTargetSnapshot(snap);
          setIsPinModalOpen(true);
        }}
        goldenBaselineId={baseline?.snapshot.id}
      />

      {/* Golden Baseline Multi-Layer Diff Modal */}
      <BaselineDiffModal
        isOpen={isBaselineDiffOpen}
        onClose={() => setIsBaselineDiffOpen(false)}
        diff={baselineDiff}
        onAskAi={() => {
          setIsBaselineDiffOpen(false);
          setIsAiDrawerOpen(true);
        }}
        onUnpinBaseline={unpinBaseline}
      />

      {/* Pin as Golden Baseline Modal */}
      <PinBaselineModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPinTargetSnapshot(null);
        }}
        snapshot={pinTargetSnapshot}
        onConfirmPin={(snap, label) => {
          pinBaseline(snap, label);
        }}
      />

      {/* AI Configuration Settings Modal */}
      <AiConfigModal
        isOpen={isAiConfigOpen}
        onClose={() => setIsAiConfigOpen(false)}
        config={aiConfig}
        onSave={handleSaveAiConfig}
      />

      {/* Interactive Multi-Turn AI Copilot Drawer */}
      <AiAnalysisDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        report={currentReport}
        config={aiConfig}
        baselineDiff={baselineDiff}
        onOpenSettings={() => {
          setIsAiDrawerOpen(false);
          setIsAiConfigOpen(true);
        }}
      />
    </div>
  );
}
