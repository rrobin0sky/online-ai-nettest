pub mod export;
pub mod models;
pub mod probes;
pub mod rca;
pub mod sentinel;

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use export::ReportExporter;
use models::{
    BufferbloatMetric, CompleteDiagnosticReport, DnsBenchmarkResult,
    MtrHopResult, ProxyTopologyInfo, TransportTlsMetric, WiFiInterfaceInfo,
};
use probes::{
    OllamaProbe, OllamaStatus, Stage1Probe, Stage2DnsProbe, Stage3MtrProbe,
    Stage4BufferbloatProbe, Stage5TransportProbe,
};
use rca::RcaEngine;
use sentinel::anomaly_detector::{AnomalyTriggerReason, IncidentMetricsSnapshot, IncidentReport};
use sentinel::heartbeat::{HeartbeatRunner, SentinelState};
use sentinel::ring_buffer::{SentinelBufferStats, SentinelSample};
use tauri::Manager;

#[tauri::command]
async fn probe_stage1_link(bypass_tunnel: Option<bool>) -> Result<WiFiInterfaceInfo, String> {
    Stage1Probe::run(bypass_tunnel).await
}

#[tauri::command]
async fn probe_stage2_proxy() -> Result<ProxyTopologyInfo, String> {
    Stage2DnsProbe::run_proxy_probe().await
}

#[tauri::command]
async fn probe_stage2_dns(domain: Option<String>) -> Result<Vec<DnsBenchmarkResult>, String> {
    let target = domain.unwrap_or_else(|| "www.aliyun.com".to_string());
    Stage2DnsProbe::run_dns_benchmark(&target).await
}

#[tauri::command]
async fn probe_stage3_mtr(
    target_name: Option<String>,
    target_host: Option<String>,
    protocol: Option<String>,
) -> Result<Vec<MtrHopResult>, String> {
    let name = target_name.unwrap_or_else(|| "AliCloud BGP Egress".to_string());
    let host = target_host.unwrap_or_else(|| "223.5.5.5".to_string());
    Stage3MtrProbe::run_traceroute_mtr(&name, &host, protocol.as_deref()).await
}

#[tauri::command]
async fn probe_stage4_bufferbloat() -> Result<BufferbloatMetric, String> {
    Stage4BufferbloatProbe::run().await
}

#[tauri::command]
async fn probe_stage5_transport(
    target_host: Option<String>,
    target_port: Option<u16>,
) -> Result<TransportTlsMetric, String> {
    let host = target_host.unwrap_or_else(|| "www.cloudflare.com".to_string());
    let port = target_port.unwrap_or(443);
    Stage5TransportProbe::run(&host, port).await
}

#[tauri::command]
async fn run_full_pipeline(
    target_domain: Option<String>,
    target_host: Option<String>,
    bypass_tunnel: Option<bool>,
) -> Result<CompleteDiagnosticReport, String> {
    let domain = target_domain.unwrap_or_else(|| "www.aliyun.com".to_string());
    let host = target_host.unwrap_or_else(|| "223.5.5.5".to_string());

    // 1. Stage 1: Local Link
    let link = Stage1Probe::run(bypass_tunnel).await?;

    // 2. Stage 2: Proxy & DNS
    let proxy = Stage2DnsProbe::run_proxy_probe().await?;
    let dns = Stage2DnsProbe::run_dns_benchmark(&domain).await?;

    // 3. Stage 3: WAN MTR
    let mtr = Stage3MtrProbe::run_traceroute_mtr("Primary Target", &host, None).await?;

    // 4. Stage 4: Bufferbloat
    let bufferbloat = Stage4BufferbloatProbe::run().await?;

    // 5. Stage 5: Transport & TLS
    let transport = Stage5TransportProbe::run(&domain, 443).await?;

    // 6. RCA Evaluation
    let mut summary = RcaEngine::evaluate(&link, &proxy, &dns, &mtr, &bufferbloat, &transport);

    // 7. Generate markdown & JSON export payloads
    summary.export_markdown = ReportExporter::generate_markdown(
        &link,
        &proxy,
        &dns,
        &mtr,
        &bufferbloat,
        &transport,
        &summary,
    );
    summary.export_json = ReportExporter::generate_json(
        &link,
        &proxy,
        &dns,
        &mtr,
        &bufferbloat,
        &transport,
        &summary,
    );

    Ok(CompleteDiagnosticReport {
        stage1_link: link,
        stage2_proxy: proxy,
        stage2_dns: dns,
        stage3_mtr: mtr,
        stage4_bufferbloat: bufferbloat,
        stage5_transport: transport,
        summary,
    })
}

// ----------------- Sentinel Commands -----------------

#[tauri::command]
async fn get_sentinel_stats(
    state: tauri::State<'_, Arc<SentinelState>>,
) -> Result<SentinelBufferStats, String> {
    let buf = state.ring_buffer.read().await;
    Ok(buf.compute_stats())
}

#[tauri::command]
async fn get_sentinel_buffer_samples(
    count: Option<usize>,
    state: tauri::State<'_, Arc<SentinelState>>,
) -> Result<Vec<SentinelSample>, String> {
    let buf = state.ring_buffer.read().await;
    let n = count.unwrap_or(150);
    Ok(buf.get_recent(n))
}

#[tauri::command]
async fn toggle_sentinel_state(
    enable: Option<bool>,
    state: tauri::State<'_, Arc<SentinelState>>,
) -> Result<bool, String> {
    let current = state.is_enabled.load(Ordering::SeqCst);
    let new_val = enable.unwrap_or(!current);
    state.is_enabled.store(new_val, Ordering::SeqCst);
    Ok(new_val)
}

#[tauri::command]
async fn trigger_manual_incident(
    state: tauri::State<'_, Arc<SentinelState>>,
) -> Result<IncidentReport, String> {
    let buf = state.ring_buffer.read().await;
    let latest = buf.latest().cloned();
    let sliding_window = buf.get_recent(30);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut distinct_bssids = Vec::new();
    for s in &sliding_window {
        if let Some(ref b) = s.bssid {
            if !distinct_bssids.contains(b) {
                distinct_bssids.push(b.clone());
            }
        }
    }

    Ok(IncidentReport {
        id: format!("inc_manual_{}", now_ms),
        timestamp: now_ms,
        trigger_reason: AnomalyTriggerReason::LatencySpike,
        trigger_description: "手动触发哨兵黑匣子快照".to_string(),
        metrics_at_trigger: IncidentMetricsSnapshot {
            gateway_rtt: latest.as_ref().and_then(|s| s.gateway_rtt),
            anycast_rtt: latest.as_ref().and_then(|s| s.anycast_rtt),
            rolling_median_rtt: buf.rolling_median_gateway_rtt(30),
            rolling_jitter: buf.rolling_jitter_gateway_rtt(30),
            loss_rate_pct: buf.loss_rate_recent(30),
            bssid: latest.as_ref().and_then(|s| s.bssid.clone()),
            ssid: latest.as_ref().and_then(|s| s.ssid.clone()),
            rssi: latest.as_ref().and_then(|s| s.rssi),
            distinct_bssids_last_60s: distinct_bssids,
        },
        frozen_samples: sliding_window,
    })
}

// ----------------- Ollama Probe Command -----------------

#[tauri::command]
async fn probe_ollama(base_url: Option<String>) -> Result<OllamaStatus, String> {
    OllamaProbe::probe(base_url).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sentinel_state = Arc::new(SentinelState::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sentinel_state.clone())
        .setup({
            let sentinel_state = sentinel_state.clone();
            move |app| {
                // Setup Menu Bar Tray and hold its lifecycle in Tauri state
                match sentinel::tray::setup_tray(app.handle()) {
                    Ok(tray) => {
                        app.manage(tray);
                    }
                    Err(e) => {
                        eprintln!("Failed to setup sentinel tray: {}", e);
                    }
                }

                // Start background heartbeat loop (2000ms tick)
                HeartbeatRunner::start(app.handle().clone(), sentinel_state);

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                #[cfg(target_os = "macos")]
                {
                    // Hide window instead of exiting so Menu Bar sentinel stays alive
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            probe_stage1_link,
            probe_stage2_proxy,
            probe_stage2_dns,
            probe_stage3_mtr,
            probe_stage4_bufferbloat,
            probe_stage5_transport,
            run_full_pipeline,
            get_sentinel_stats,
            get_sentinel_buffer_samples,
            toggle_sentinel_state,
            trigger_manual_incident,
            probe_ollama
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, code, .. } => {
                    eprintln!("[TAURI EVENT] ExitRequested code: {:?}", code);
                    api.prevent_exit();
                }
                tauri::RunEvent::Exit => {
                    eprintln!("[TAURI EVENT] Exit");
                }
                tauri::RunEvent::WindowEvent { label, event: ref win_event, .. } => {
                    eprintln!("[TAURI EVENT] WindowEvent: {} -> {:?}", label, win_event);
                }
                _ => {}
            }
        });
}
