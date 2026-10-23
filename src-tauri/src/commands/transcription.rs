use serde::{Deserialize, Serialize};
use tauri::State;

use crate::bible::detection::{self, DetectionContext, ScriptureDetectionMatch};
use crate::db::{get_setting, lock_db, set_setting};
use crate::secrets::{self, OsSecretStore, SecretStore};
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
/// Everything but the Gemini key lives in the app database; the key lives in Windows
/// Credential Manager (see `secrets`). The webview still receives it, because it opens
/// the Gemini socket itself.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionEngineConfig {
    #[serde(default)]
    pub gemini_api_key: String,
    #[serde(default)]
    pub gemini_model: String,
    #[serde(default)]
    pub whisper_model_path: String,
    /// Language spoken in the service, for every engine: "en", "fr" or "auto" (English
    /// and French). English-only Whisper models always hear English.
    #[serde(default = "default_whisper_language")]
    pub whisper_language: String,
}

fn default_whisper_language() -> String {
    "en".to_string()
}

/// The settings row with the key taken out: what is safe to keep in the database.
fn store_without_key(conn: &rusqlite::Connection, config: &TranscriptionEngineConfig) -> Result<(), String> {
    let stored = TranscriptionEngineConfig {
        gemini_api_key: String::new(),
        ..config.clone()
    };
    let json = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
    set_setting(conn, ENGINE_SETTINGS_KEY, &json)
}

/// Read the settings, moving a key saved by an older version out of the database and
/// into the credential store the first time it is seen.
pub fn load_engine_config(
    conn: &rusqlite::Connection,
    store: &dyn SecretStore,
) -> Result<TranscriptionEngineConfig, String> {
    let mut config: TranscriptionEngineConfig = match get_setting(conn, ENGINE_SETTINGS_KEY)? {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string())?,
        None => TranscriptionEngineConfig::default(),
    };
    let legacy_key = config.gemini_api_key.trim().to_string();
    if !legacy_key.is_empty() {
        // Only clear the database copy once the credential store has it.
        secrets::put(store, secrets::GEMINI_API_KEY, &legacy_key)?;
        store_without_key(conn, &config)?;
        config.gemini_api_key = legacy_key;
        return Ok(config);
    }
    config.gemini_api_key = store.get(secrets::GEMINI_API_KEY)?.unwrap_or_default();
    Ok(config)
}

pub fn save_engine_config(
    conn: &rusqlite::Connection,
    store: &dyn SecretStore,
    config: &TranscriptionEngineConfig,
) -> Result<(), String> {
    secrets::put(store, secrets::GEMINI_API_KEY, &config.gemini_api_key)?;
    store_without_key(conn, config)
}

#[tauri::command]
pub fn get_transcription_engine_config(
    state: State<AppState>,
) -> Result<TranscriptionEngineConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| load_engine_config(conn, &OsSecretStore))
}

#[tauri::command]
pub fn save_transcription_engine_config(
    state: State<AppState>,
    config: TranscriptionEngineConfig,
) -> Result<TranscriptionEngineConfig, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        save_engine_config(conn, &OsSecretStore, &config)?;
        Ok(config.clone())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::MemorySecretStore;

    fn db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn stored_json(conn: &rusqlite::Connection) -> String {
        get_setting(conn, ENGINE_SETTINGS_KEY).unwrap().unwrap_or_default()
    }

    #[test]
    fn saving_keeps_the_key_out_of_the_database() {
        let (conn, store) = (db(), MemorySecretStore::default());
        let config = TranscriptionEngineConfig {
            gemini_api_key: "secret-key".into(),
            whisper_language: "fr".into(),
            ..Default::default()
        };
        save_engine_config(&conn, &store, &config).unwrap();
        assert!(!stored_json(&conn).contains("secret-key"));
        assert_eq!(store.get(secrets::GEMINI_API_KEY).unwrap().as_deref(), Some("secret-key"));
        let loaded = load_engine_config(&conn, &store).unwrap();
        assert_eq!(loaded.gemini_api_key, "secret-key");
        assert_eq!(loaded.whisper_language, "fr");
    }

    #[test]
    fn a_key_saved_by_an_older_version_moves_to_the_credential_store() {
        let (conn, store) = (db(), MemorySecretStore::default());
        set_setting(&conn, ENGINE_SETTINGS_KEY, r#"{"geminiApiKey":"old-key","whisperModelPath":"m.bin"}"#).unwrap();
        let loaded = load_engine_config(&conn, &store).unwrap();
        assert_eq!(loaded.gemini_api_key, "old-key");
        assert_eq!(loaded.whisper_model_path, "m.bin");
        assert!(!stored_json(&conn).contains("old-key"));
        assert_eq!(store.get(secrets::GEMINI_API_KEY).unwrap().as_deref(), Some("old-key"));
    }

    #[test]
    fn clearing_the_key_removes_it_from_the_credential_store() {
        let (conn, store) = (db(), MemorySecretStore::default());
        store.set(secrets::GEMINI_API_KEY, "secret-key").unwrap();
        save_engine_config(&conn, &store, &TranscriptionEngineConfig::default()).unwrap();
        assert_eq!(store.get(secrets::GEMINI_API_KEY).unwrap(), None);
    }
}
