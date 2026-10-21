use serde::{Deserialize, Serialize};
use tauri::State;

use crate::bible::detection::{self, DetectionContext, ScriptureDetectionMatch};
use crate::db::{get_setting, lock_db, set_setting};
use crate::transcription::{
    delete_session, get_session, list_sessions, save_session, SaveTranscriptionSessionInput,
    TranscriptionSessionDetail, TranscriptionSessionSummary,
};
use crate::AppState;

#[tauri::command]
pub fn detect_scripture_in_text(
    text: String,
    context: Option<DetectionContext>,
) -> Result<Vec<ScriptureDetectionMatch>, String> {
    Ok(detection::detect_references_with_context(&text, context.as_ref()))
}

#[tauri::command]
pub fn list_transcription_sessions(
    state: State<AppState>,
    limit: Option<i64>,
) -> Result<Vec<TranscriptionSessionSummary>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| list_sessions(conn, limit.unwrap_or(20)))
}

#[tauri::command]
pub fn get_transcription_session(
    state: State<AppState>,
    id: String,
) -> Result<TranscriptionSessionDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| get_session(conn, &id))
}

#[tauri::command]
pub fn save_transcription_session(
    state: State<AppState>,
    input: SaveTranscriptionSessionInput,
) -> Result<String, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| save_session(conn, input))
}

#[tauri::command]
pub fn delete_transcription_session(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| delete_session(conn, &id))
}

pub const ENGINE_SETTINGS_KEY: &str = "transcription.engines";

/// Operator-supplied settings for the selectable transcription engines.
///
/// Stored in the app database rather than web storage so the Gemini key does not sit in
/// localStorage. It is still readable by the webview, which needs it to open the socket.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionEngineConfig {
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default)]
    pub gemini_model: String,
    #[serde(default)]
    pub whisper_model_path: String,
}

#[tauri::command]
pub fn get_transcription_engine_config(
    state: State<AppState>,
) -> Result<TranscriptionEngineConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| match get_setting(conn, ENGINE_SETTINGS_KEY)? {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(TranscriptionEngineConfig::default()),
    })
}

#[tauri::command]
pub fn save_transcription_engine_config(
    state: State<AppState>,
    config: TranscriptionEngineConfig,
) -> Result<TranscriptionEngineConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
        set_setting(conn, ENGINE_SETTINGS_KEY, &json)?;
        Ok(config.clone())
    })
}

#[tauri::command]
pub fn load_whisper_model(model_path: String) -> Result<String, String> {
    crate::transcription::whisper::load_model(&model_path)?;
    Ok(model_path)
}

/// Runs on a blocking thread: whisper is CPU-bound and would stall the async runtime.
#[tauri::command]
pub async fn transcribe_audio_segment(
    model_path: String,
    sample_rate: u32,
    pcm_base64: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::transcription::whisper::transcribe(&model_path, sample_rate, &pcm_base64)
    })
    .await
    .map_err(|e| e.to_string())?
}
