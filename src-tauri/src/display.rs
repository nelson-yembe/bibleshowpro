use serde::Serialize;
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Debug, Clone, Serialize)]
pub struct DisplayInfo {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputStatus {
    pub open: bool,
    pub active_display: Option<DisplayInfo>,
    pub displays: Vec<DisplayInfo>,
}

pub fn list_displays(app: &AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| display_info_from_monitor(index, &monitor, &primary))
        .collect())
}

pub fn pick_output_monitor(app: &AppHandle) -> Result<Monitor, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("No displays detected".into());
    }

    let primary = app.primary_monitor().map_err(|e| e.to_string())?;

    let mut external: Vec<Monitor> = monitors
        .into_iter()
        .filter(|monitor| !monitor_is_primary(&primary, monitor))
        .collect();

    if !external.is_empty() {
        external.sort_by_key(|monitor| {
            let size = monitor.size();
            i64::from(size.width) * i64::from(size.height)
        });
        return external
            .into_iter()
            .next_back()
            .ok_or_else(|| "No external display found".into());
    }

    primary.ok_or_else(|| "No primary display found".into())
}

pub fn place_output_on_monitor(window: &WebviewWindow, monitor: &Monitor) -> Result<(), String> {
    let position = monitor.position();
    let size = monitor.size();

    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn output_status(app: &AppHandle) -> Result<OutputStatus, String> {
    let displays = list_displays(app)?;
    let open = app.get_webview_window("output").is_some();
    let active_display = if open {
        pick_output_monitor(app)
            .ok()
            .and_then(|monitor| {
                let primary = app.primary_monitor().ok().flatten();
                displays.iter().find(|display| {
                    display.name
                        == monitor
                            .name()
                            .map(|value| value.to_string())
                            .unwrap_or_default()
                        && display.x == monitor.position().x
                        && display.y == monitor.position().y
                })
                .cloned()
                .or_else(|| {
                    Some(display_info_from_monitor(
                        0,
                        &monitor,
                        &primary,
                    ))
                })
            })
    } else {
        None
    };

    Ok(OutputStatus {
        open,
        active_display,
        displays,
    })
}

pub fn display_info_from_monitor(
    index: usize,
    monitor: &Monitor,
    primary: &Option<Monitor>,
) -> DisplayInfo {
    let name = monitor
        .name()
        .map(|value| value.to_string())
        .unwrap_or_else(|| format!("Display {}", index + 1));
    let position = monitor.position();
    let size = monitor.size();
    let is_primary = monitor_is_primary(primary, monitor);
    let id = format!("{}@{}x{}", name, position.x, position.y);

    DisplayInfo {
        id,
        name,
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        scale_factor: monitor.scale_factor(),
        is_primary,
    }
}

fn monitor_is_primary(primary: &Option<Monitor>, monitor: &Monitor) -> bool {
    let Some(primary) = primary else {
        return false;
    };

    primary.name() == monitor.name()
        && primary.position() == monitor.position()
        && primary.size() == monitor.size()
}

pub fn display_signature(displays: &[DisplayInfo]) -> String {
    displays
        .iter()
        .map(|display| {
            format!(
                "{}:{}x{}@{}x{}",
                display.id, display.width, display.height, display.x, display.y
            )
        })
        .collect::<Vec<_>>()
        .join("|")
}
