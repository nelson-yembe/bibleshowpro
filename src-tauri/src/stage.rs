//! Stage display: a confidence monitor for the preacher and the band. It shows what is on
//! the projector now, what is staged next, the time, and a message from the operator.
//!
//! It is a second window fed by the same program and preview updates as the projector,
//! so it can never disagree with what the congregation sees.

use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::display;

pub const STAGE_LABEL: &str = "stage";

static MESSAGE: Mutex<String> = Mutex::new(String::new());

/// Everything the stage window needs to draw itself when it opens mid-service.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageState {
    pub open: bool,
    pub program: Option<Value>,
    pub preview: Option<Value>,
    pub message: String,
}

pub fn state(app: &AppHandle) -> StageState {
    StageState {
        open: app.get_webview_window(STAGE_LABEL).is_some(),
        program: crate::output::stored_program(),
        preview: crate::output::stored_preview(),
        message: MESSAGE.lock().map(|m| m.clone()).unwrap_or_default(),
    }
}

/// The projector learns about preview changes only through the NDI window; the stage
/// display needs them too, to show what comes next.
pub fn forward_preview(app: &AppHandle, scene: &Option<Value>) {
    if app.get_webview_window(STAGE_LABEL).is_some() {
        let _ = app.emit_to(STAGE_LABEL, "preview-update", scene);
    }
}

pub fn set_message(app: &AppHandle, message: String) {
    let message = message.trim().to_string();
    if let Ok(mut guard) = MESSAGE.lock() {
        *guard = message.clone();
    }
    if app.get_webview_window(STAGE_LABEL).is_some() {
        let _ = app.emit_to(STAGE_LABEL, "stage-message", &message);
    }
}

/// Open the stage display, full screen on `display_id` when given, otherwise as a window
/// the operator can drag to whichever screen faces the platform.
pub fn open(app: &AppHandle, display_id: Option<String>) -> Result<(), String> {
    let monitor = match display_id {
        Some(id) => {
            let primary = app.primary_monitor().map_err(|e| e.to_string())?;
            let monitors = app.available_monitors().map_err(|e| e.to_string())?;
            let found = monitors
                .into_iter()
                .enumerate()
                .find(|(index, m)| display::display_info_from_monitor(*index, m, &primary).id == id)
                .map(|(_, m)| m);
            Some(found.ok_or_else(|| "That display is no longer connected. Choose another.".to_string())?)
        }
        None => None,
    };

    if let Some(window) = app.get_webview_window(STAGE_LABEL) {
        if let Some(monitor) = &monitor {
            display::place_output_on_monitor(&window, monitor)?;
        }
        let _ = window.set_focus();
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(app, STAGE_LABEL, WebviewUrl::App("stage.html".into()))
        .title("Bible Show Pro — Stage display");
    let window = match &monitor {
        Some(monitor) => {
            let position = monitor.position();
            let size = monitor.size();
            builder
                .decorations(false)
                .position(position.x as f64, position.y as f64)
                .inner_size(size.width as f64, size.height as f64)
                .fullscreen(true)
        }
        None => builder.inner_size(1024.0, 576.0).resizable(true),
    }
    .build()
    .map_err(|e| e.to_string())?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            let _ = handle.emit("stage-closed", ());
        }
    });
    let _ = app.emit("stage-opened", ());
    Ok(())
}

pub fn close(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(STAGE_LABEL) {
        let _ = window.close();
    }
}
