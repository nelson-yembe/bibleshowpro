use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

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

static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WhisperDownloadProgress {
    model_id: String,
    received: u64,
    total: u64,
}

#[tauri::command]
pub fn list_whisper_models() -> Vec<crate::transcription::models::WhisperModelInfo> {
    crate::transcription::models::catalog()
}

#[tauri::command]
pub fn cancel_whisper_download() {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

/// Streams a model to the app data folder, reporting progress as it goes.
///
/// Writes to a .part file and only renames once the byte count matches what Hugging Face
/// advertised, so an interrupted download can never be mistaken for a usable model.
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_id: String) -> Result<String, String> {
    let model = crate::transcription::models::find(&model_id)
        .ok_or_else(|| format!("Unknown Whisper model: {model_id}"))?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(&model.filename);

    if let Ok(meta) = std::fs::metadata(&final_path) {
        if meta.len() == model.size_bytes {
            return Ok(final_path.to_string_lossy().to_string());
        }
    }

    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
    let part_path = dir.join(format!("{}.part", model.filename));
    let mut file = std::fs::File::create(&part_path).map_err(|e| e.to_string())?;

    let mut response = reqwest::get(&model.url)
        .await
        .map_err(|e| format!("Could not reach the model host: {e}"))?;
    if !response.status().is_success() {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!("Model host returned {}", response.status()));
    }
    let total = response.content_length().unwrap_or(model.size_bytes);

    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|e| format!("Download interrupted: {e}"))?;
        let Some(chunk) = chunk else { break };

        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(&part_path);
            return Err("Download cancelled.".to_string());
        }

        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
            last_emit = std::time::Instant::now();
            let _ = app.emit(
                "whisper-download-progress",
                WhisperDownloadProgress {
                    model_id: model.id.clone(),
                    received,
                    total,
                },
            );
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    if received != model.size_bytes {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!(
            "Download incomplete — received {received} of {} bytes. Nothing was saved.",
            model.size_bytes
        ));
    }

    std::fs::rename(&part_path, &final_path).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "whisper-download-progress",
        WhisperDownloadProgress {
            model_id: model.id.clone(),
            received,
            total,
        },
    );
    Ok(final_path.to_string_lossy().to_string())
}
