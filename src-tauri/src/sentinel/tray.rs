use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let quit_item = MenuItem::with_id(app, "quit", "退出 NetPath-Lens Pro", true, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open_dashboard", "打开控制台 (Open Dashboard)", true, None::<&str>)?;
    let toggle_item = MenuItem::with_id(app, "toggle_sentinel", "哨兵监测: 运行中 (点击暂停)", true, None::<&str>)?;
    let snapshot_item = MenuItem::with_id(app, "manual_snapshot", "立即抓取诊断快照 (Capture Snapshot)", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &toggle_item,
            &snapshot_item,
            &separator,
            &quit_item,
        ],
    )?;

    let tray = TrayIconBuilder::with_id("sentinel-tray")
        .title("🟢 哨兵启动中...")
        .tooltip("NetPath-Lens Pro - 链路根因哨兵")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            eprintln!("[MENU EVENT] id: {}", id);
            match id {
                "quit" => {
                    eprintln!("[MENU EVENT] User requested quit");
                    std::process::exit(0);
                }
                "open_dashboard" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "toggle_sentinel" => {
                    let _ = app.emit("sentinel-toggle-request", ());
                }
                "manual_snapshot" => {
                    let _ = app.emit("sentinel-trigger-snapshot", ());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}
