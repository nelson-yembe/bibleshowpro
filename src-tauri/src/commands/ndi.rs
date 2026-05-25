use crate::db::{get_setting, lock_db, set_setting};
use crate::ndi::{
    self, NdiDiscoveredSource, NdiOutputConfig, NdiRuntimeStatus, SETTINGS_KEY,
};
use crate::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_ndi_config(state: State<AppState>) -> Result<NdiOutputConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let raw = get_setting(conn, SETTINGS_KEY)?;
        match raw {
            Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
            None => Ok(NdiOutputConfig::default()),
        }
    })
}

#[tauri::command]
pub fn save_ndi_config(state: State<AppState>, config: NdiOutputConfig) -> Result<NdiOutputConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
        set_setting(conn, SETTINGS_KEY, &json)?;
        Ok(config)
    })
}

#[tauri::command]
pub async fn start_ndi_output(app: AppHandle, state: State<'_, AppState>) -> Result<NdiRuntimeStatus, String> {
    let config = get_ndi_config(state)?;
    ndi::start(app, config).await
}

#[tauri::command]
pub async fn stop_ndi_output() -> Result<NdiRuntimeStatus, String> {
    ndi::stop().await
}

#[tauri::command]
pub fn get_ndi_status() -> Result<NdiRuntimeStatus, String> {
    ndi::get_status()
}

#[tauri::command]
pub fn discover_ndi_sources(timeout_ms: Option<u64>) -> Result<Vec<NdiDiscoveredSource>, String> {
    ndi::discover_sources_sync(timeout_ms.unwrap_or(2500))
}

#[tauri::command]
pub fn push_ndi_frame(
    feed: String,
    width: u32,
    height: u32,
    data: Vec<u8>,
) -> Result<(), String> {
    ndi::push_ipc_frame(&feed, width, height, data)
}

#[tauri::command]
pub fn push_preview_update(
    app: AppHandle,
    scene: Option<serde_json::Value>,
) -> Result<(), String> {
    crate::output::emit_preview_update(&app, scene)
}
