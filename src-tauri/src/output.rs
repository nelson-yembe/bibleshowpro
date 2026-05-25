use crate::display::{self, DisplayInfo, OutputStatus};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static LAST_PROGRAM: Mutex<Option<Value>> = Mutex::new(None);
static LAST_PREVIEW: Mutex<Option<Value>> = Mutex::new(None);

pub fn store_program(scene: Option<Value>) {
    if let Ok(mut guard) = LAST_PROGRAM.lock() {
        *guard = scene;
    }
}

pub fn stored_program() -> Option<Value> {
    LAST_PROGRAM.lock().ok().and_then(|guard| guard.clone())
}

pub fn store_preview(scene: Option<Value>) {
    if let Ok(mut guard) = LAST_PREVIEW.lock() {
        *guard = scene;
    }
}

pub fn stored_preview() -> Option<Value> {
    LAST_PREVIEW.lock().ok().and_then(|guard| guard.clone())
}

pub fn emit_preview_update(app: &AppHandle, scene: Option<Value>) -> Result<(), String> {
    store_preview(scene.clone());
    if app.get_webview_window("ndi-preview").is_some() {
        app.emit_to("ndi-preview", "preview-update", &scene)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn replay_stored_preview(app: &AppHandle) {
    if let Some(scene) = stored_preview() {
        let _ = app.emit_to("ndi-preview", "preview-update", &scene);
    }
}

pub fn emit_program_update(app: &AppHandle, scene: Option<Value>) -> Result<(), String> {
    store_program(scene.clone());
    app.emit("program-update", &scene)
        .map_err(|e| e.to_string())?;
    if app.get_webview_window("output").is_some() {
        let _ = app.emit_to("output", "program-update", &scene);
    }
    Ok(())
}

pub fn replay_stored_program(app: &AppHandle) {
    if let Some(scene) = stored_program() {
        let _ = app.emit("program-update", &scene);
        let _ = app.emit_to("output", "program-update", &scene);
    }
}

pub async fn ensure_output_window(app: AppHandle) -> Result<DisplayInfo, String> {
    let monitor = display::pick_output_monitor(&app)?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    let display = display::display_info_from_monitor(0, &monitor, &primary);

    if let Some(window) = app.get_webview_window("output") {
        display::place_output_on_monitor(&window, &monitor)?;
        let _ = app.emit("output-opened", &display);
        crate::keep_awake::set_output_active(true);
        replay_stored_program(&app);
        return Ok(display);
    }

    let position = monitor.position();
    let size = monitor.size();

    let window = WebviewWindowBuilder::new(&app, "output", WebviewUrl::App("output.html".into()))
        .title("Bible Show Pro — Output")
        .decorations(false)
        .resizable(false)
        .position(position.x as f64, position.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .fullscreen(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            crate::keep_awake::set_output_active(false);
            let _ = app_handle.emit("output-closed", ());
        }
    });

    display::place_output_on_monitor(&window, &monitor)?;
    let _ = app.emit("output-opened", &display);
    crate::keep_awake::set_output_active(true);

    let replay_app = app.clone();
    tauri::async_runtime::spawn(async move {
        for delay_ms in [50_u64, 200, 500, 1200] {
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            replay_stored_program(&replay_app);
        }
    });

    Ok(display)
}

pub async fn refresh_output_window(app: AppHandle) -> Result<Option<DisplayInfo>, String> {
    let Some(window) = app.get_webview_window("output") else {
        return Ok(None);
    };

    let monitor = display::pick_output_monitor(&app)?;
    display::place_output_on_monitor(&window, &monitor)?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    let display = display::display_info_from_monitor(0, &monitor, &primary);
    let _ = app.emit("output-opened", &display);
    replay_stored_program(&app);
    Ok(Some(display))
}

pub fn get_output_status(app: &AppHandle) -> Result<OutputStatus, String> {
    display::output_status(app)
}

pub async fn close_output_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("output") {
        window.close().map_err(|e| e.to_string())?;
        crate::keep_awake::set_output_active(false);
    }
    Ok(())
}

const AUXILIARY_WINDOW_LABELS: &[&str] = &["output", "ndi-preview"];

/// Close projector/NDI windows and stop streaming when the app is exiting.
pub fn shutdown_all(app: &AppHandle) {
    for label in AUXILIARY_WINDOW_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.close();
        }
    }

    crate::keep_awake::set_output_active(false);
    crate::keep_awake::set_presentation_active(false);

    if let Err(error) = crate::ndi::stop_sync() {
        eprintln!("[shutdown] NDI stop failed: {error}");
    }
}

pub fn start_display_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_signature = String::new();

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            let displays = match display::list_displays(&app) {
                Ok(displays) => displays,
                Err(error) => {
                    eprintln!("[display-watcher] {error}");
                    continue;
                }
            };

            let signature = display::display_signature(&displays);
            if signature != last_signature {
                last_signature = signature;
                let _ = app.emit("display-changed", &displays);
            }

            if app.get_webview_window("output").is_some() {
                if let Err(error) = refresh_output_window(app.clone()).await {
                    eprintln!("[display-watcher] refresh output failed: {error}");
                }
            }
        }
    });
}
