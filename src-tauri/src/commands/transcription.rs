use tauri::State;

use crate::bible::detection::{self, ScriptureDetectionMatch};
use crate::db::lock_db;
use crate::transcription::{
    delete_session, get_session, list_sessions, save_session, SaveTranscriptionSessionInput,
    TranscriptionSessionDetail, TranscriptionSessionSummary,
};
use crate::AppState;

#[tauri::command]
pub fn detect_scripture_in_text(text: String) -> Result<Vec<ScriptureDetectionMatch>, String> {
    Ok(detection::detect_references_in_text(&text))
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
