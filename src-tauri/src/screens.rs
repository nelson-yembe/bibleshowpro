//! Screens with roles: which display the main projector fills, and side screens that copy
//! it (a second projector across the stage, a lobby TV, a screen at the back).
//!
//! A side screen is another `output.html` window. It receives the same `program-update`
//! broadcast as the projector, so it can never show something different.

use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::display;

pub const SIDE_PREFIX: &str = "side-";

/// Display id the main projector should fill; `None` picks the largest external screen.
static PROJECTOR_DISPLAY: Mutex<Option<String>> = Mutex::new(None);
/// Open side screens: display id → window label.
static SIDE_SCREENS: Mutex<BTreeMap<String, String>> = Mutex::new(BTreeMap::new());
static NEXT_SIDE: Mutex<u32> = Mutex::new(1);

pub fn set_projector_display(display_id: Option<String>) {
    if let Ok(mut guard) = PROJECTOR_DISPLAY.lock() {
        *guard = display_id.filter(|id| !id.is_empty());
    }
}

pub fn projector_display() -> Option<String> {
    PROJECTOR_DISPLAY.lock().ok().and_then(|guard| guard.clone())
}

/// Display ids with a side screen open.
pub fn open_side_screens(app: &AppHandle) -> Vec<String> {
    let Ok(mut screens) = SIDE_SCREENS.lock() else {
        return Vec::new();
    };
    // A window the operator closed by hand is gone; forget it.
    screens.retain(|_, label| app.get_webview_window(label).is_some());
    screens.keys().cloned().collect()
}

pub fn open_side_screen(app: &AppHandle, display_id: &str) -> Result<(), String> {
    let monitor = display::monitor_by_id(app, display_id)?;
    let existing = SIDE_SCREENS
        .lock()
        .map_err(|e| e.to_string())?
        .get(display_id)
        .cloned();
    if let Some(window) = existing.and_then(|label| app.get_webview_window(&label)) {
        display::reposition_output_on_monitor(&window, &monitor)?;
        return Ok(());
    }

    let label = {
        let mut next = NEXT_SIDE.lock().map_err(|e| e.to_string())?;
        let label = format!("{SIDE_PREFIX}{next}");
        *next += 1;
        label
    };
    let position = monitor.position();
    let size = monitor.size();
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("output.html?role=side".into()))
        .title("Bible Show Pro — Side screen")
        .decorations(false)
        .resizable(false)
        .position(position.x as f64, position.y as f64)
        .inner_size(size.width as f64, size.height as f64)
        .fullscreen(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    let closed_id = display_id.to_string();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Ok(mut screens) = SIDE_SCREENS.lock() {
                screens.remove(&closed_id);
            }
            let _ = handle.emit("screens-changed", ());
        }
    });
    SIDE_SCREENS
        .lock()
        .map_err(|e| e.to_string())?
        .insert(display_id.to_string(), label);
    let _ = app.emit("screens-changed", ());
    Ok(())
}

pub fn close_side_screen(app: &AppHandle, display_id: &str) {
    let label = SIDE_SCREENS.lock().ok().and_then(|mut s| s.remove(display_id));
    if let Some(window) = label.and_then(|label| app.get_webview_window(&label)) {
        let _ = window.close();
    }
}

pub fn close_side_screens(app: &AppHandle) {
    for id in open_side_screens(app) {
        close_side_screen(app, &id);
    }
}

/// After the displays change: keep each side screen on its display, or close it when the
/// display is gone rather than let it land on the operator's screen.
pub fn follow_displays(app: &AppHandle) {
    for id in open_side_screens(app) {
        match display::monitor_by_id(app, &id) {
            Ok(monitor) => {
                let label = SIDE_SCREENS.lock().ok().and_then(|s| s.get(&id).cloned());
                if let Some(window) = label.and_then(|label| app.get_webview_window(&label)) {
                    let _ = display::reposition_output_on_monitor(&window, &monitor);
                }
            }
            Err(_) => close_side_screen(app, &id),
        }
    }
}
