use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

use crate::transcription::models::{self, WhisperModelInfo};
use crate::transcription::system::{self, SystemProfile};
use crate::transcription::worker;

/// Physical cores never change while the app runs, so size the thread pool once.
static THREADS: Lazy<i32> =
    Lazy::new(|| system::inference_threads(system::system_profile().physical_cores));

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create the models folder: {e}"))?;
    Ok(dir)
}

/// whisper.cpp logs to stderr; keeping that in a file makes a field failure diagnosable.
fn worker_log(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_log_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("whisper-worker.log"))
}

/// Silero speech detector, shipped as a bundle resource (see tauri.conf.json).
const SPEECH_DETECTOR: &str = "resources/ggml-silero-v6.2.0.bin";

/// Absent only in a build that skipped bundling; transcription then runs without it.
fn speech_detector(app: &AppHandle) -> Option<String> {
    let path = app.path().resolve(SPEECH_DETECTOR, BaseDirectory::Resource).ok()?;
    path.exists().then(|| path_string(&path))
}

fn file_len(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|m| m.len())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

/// English-only models must be told English; asking them for French produces nonsense.
fn effective_language(model_path: &str, requested: Option<&str>) -> String {
    let file = Path::new(model_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if file.ends_with(".en.bin") {
        return "en".to_string();
    }
    match requested.map(str::trim) {
        Some(lang) if !lang.is_empty() => lang.to_string(),
        _ => "auto".to_string(),
    }
}

/// Rough memory need for a model file the catalog does not know about.
fn estimated_ram_mb(model_path: &str) -> u64 {
    let name = Path::new(model_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if let Some(known) = models::catalog().into_iter().find(|m| m.filename == name) {
        return known.ram_mb;
    }
    file_len(Path::new(model_path))
        .map(|bytes| bytes / 1_048_576 * 14 / 10 + 150)
        .unwrap_or(0)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionCapabilities {
    pub profile: SystemProfile,
    pub recommended_tier: Option<String>,
    pub inference_threads: i32,
    pub models_dir: String,
    pub free_disk_mb: Option<u64>,
}

#[tauri::command]
pub async fn get_transcription_capabilities(
    app: AppHandle,
) -> Result<TranscriptionCapabilities, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let profile = system::system_profile();
        let recommended_tier = system::recommend_tier(
            profile.cpu.supported,
            profile.physical_cores,
            profile.total_memory_mb,
        )
        .map(str::to_string);
        TranscriptionCapabilities {
            inference_threads: system::inference_threads(profile.physical_cores),
            recommended_tier,
            free_disk_mb: system::free_space_mb(&dir),
            models_dir: path_string(&dir),
            profile,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelListing {
    #[serde(flatten)]
    pub info: WhisperModelInfo,
    pub downloaded: bool,
    pub path: String,
    /// Bytes already on disk from an interrupted download; Download resumes from here.
    pub partial_bytes: u64,
}

#[tauri::command]
pub fn list_whisper_models(app: AppHandle) -> Result<Vec<WhisperModelListing>, String> {
    let dir = models_dir(&app)?;
    Ok(models::catalog()
        .into_iter()
        .map(|info| {
            let path = dir.join(&info.filename);
            let downloaded = file_len(&path) == Some(info.size_bytes);
            let partial_bytes = file_len(&dir.join(format!("{}.part", info.filename)))
                .unwrap_or(0)
                .min(info.size_bytes);
            WhisperModelListing {
                downloaded,
                path: path_string(&path),
                partial_bytes,
                info,
            }
        })
        .collect())
}

/// Start the worker and load the model, refusing up front when this PC cannot run it.
#[tauri::command]
pub async fn load_whisper_model(app: AppHandle, model_path: String) -> Result<String, String> {
    let log = worker_log(&app);
    let detector = speech_detector(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let profile = system::system_profile();
        if !profile.cpu.supported {
            return Err(system::unsupported_cpu_message(&profile.cpu.missing));
        }
        if !Path::new(&model_path).exists() {
            return Err(format!(
                "The Whisper model file is missing ({model_path}). Download a model in Settings → Transcription Engine."
            ));
        }
        let needed = estimated_ram_mb(&model_path);
        if let Some(short) = system::memory_shortfall_mb(needed, profile.available_memory_mb) {
            // Skip the refusal if the model is already resident: it is using that memory.
            if worker::loaded_path().as_deref() != Some(model_path.as_str()) {
                return Err(format!(
                    "Not enough free memory for this model (about {short} MB short). Choose a smaller model or close other programs."
                ));
            }
        }
        worker::ensure_loaded(&model_path, detector.as_deref(), log.as_deref())?;
        Ok(model_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Runs in the worker process; a native fault there comes back as an error here.
#[tauri::command]
pub async fn transcribe_audio_segment(
    app: AppHandle,
    model_path: String,
    sample_rate: u32,
    pcm_base64: String,
    language: Option<String>,
) -> Result<String, String> {
    let log = worker_log(&app);
    let detector = speech_detector(&app);
    let language = effective_language(&model_path, language.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        worker::transcribe(
            &model_path,
            detector.as_deref(),
            pcm_base64,
            sample_rate,
            language,
            *THREADS,
            log.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop the worker and give its memory back — on a low-spec PC the model is hundreds of
/// megabytes the projection would rather have between services.
#[tauri::command]
pub async fn release_whisper_model() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(worker::shutdown)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_whisper_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let model = models::find(&model_id).ok_or_else(|| format!("Unknown Whisper model: {model_id}"))?;
    let dir = models_dir(&app)?;
    let path = dir.join(&model.filename);
    let target = path_string(&path);
    tauri::async_runtime::spawn_blocking(move || {
        if worker::loaded_path().as_deref() == Some(target.as_str()) {
            worker::shutdown();
        }
        for file in [path.clone(), dir.join(format!("{}.part", model.filename))] {
            if file.exists() {
                fs::remove_file(&file).map_err(|e| format!("Could not delete {}: {e}", file.display()))?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------------

static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

const MAX_ATTEMPTS: u32 = 5;
const SEND_TIMEOUT: Duration = Duration::from_secs(30);
/// No bytes for this long means the connection has stalled, not just slowed.
const STALL_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received: u64,
    total: u64,
    /// "downloading" | "verifying" | "done"
    phase: &'static str,
}

fn emit_progress(app: &AppHandle, model: &WhisperModelInfo, received: u64, phase: &'static str) {
    let _ = app.emit(
        "whisper-download-progress",
        DownloadProgress {
            model_id: model.id.clone(),
            received,
            total: model.size_bytes,
            phase,
        },
    );
}

#[tauri::command]
pub fn cancel_whisper_download() {
    DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
}

enum FetchError {
    Cancelled,
    Retryable(String),
    Fatal(String),
}

/// Streams a model into the app data folder.
///
/// Resumable: an interrupted transfer leaves a .part file and the next attempt asks the
/// host for the remainder, so a flaky church connection does not mean starting a 488 MB
/// download from zero. Verified: the finished file must match the published SHA-256
/// before it is renamed into place, so a damaged model can never be loaded.
#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_id: String) -> Result<String, String> {
    let model = models::find(&model_id).ok_or_else(|| format!("Unknown Whisper model: {model_id}"))?;
    let dir = models_dir(&app)?;
    let final_path = dir.join(&model.filename);
    if file_len(&final_path) == Some(model.size_bytes) {
        return Ok(path_string(&final_path));
    }

    let part_path = dir.join(format!("{}.part", model.filename));
    let already = file_len(&part_path).unwrap_or(0).min(model.size_bytes);

    if let Some(free_mb) = system::free_space_mb(&dir) {
        let needed_mb = (model.size_bytes - already) / 1_048_576 + 100;
        if free_mb < needed_mb {
            return Err(format!(
                "Not enough disk space: this model needs about {needed_mb} MB free and the drive has {free_mb} MB."
            ));
        }
    }

    DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_error = String::from("no response");
    for attempt in 0..MAX_ATTEMPTS {
        match fetch_into(&app, &client, &model, &part_path).await {
            Ok(()) => break,
            Err(FetchError::Cancelled) => {
                let _ = fs::remove_file(&part_path);
                return Err("Download cancelled.".to_string());
            }
            Err(FetchError::Fatal(message)) => return Err(message),
            Err(FetchError::Retryable(message)) => {
                last_error = message;
                if attempt + 1 < MAX_ATTEMPTS {
                    tokio::time::sleep(Duration::from_secs(2u64 << attempt)).await;
                }
            }
        }
    }

    if file_len(&part_path) != Some(model.size_bytes) {
        return Err(format!(
            "The download kept failing ({last_error}). Progress is saved — choose Download again to resume."
        ));
    }

    emit_progress(&app, &model, model.size_bytes, "verifying");
    let hash_path = part_path.clone();
    let digest = tauri::async_runtime::spawn_blocking(move || sha256_file(&hash_path))
        .await
        .map_err(|e| e.to_string())??;
    if !digest.eq_ignore_ascii_case(&model.sha256) {
        let _ = fs::remove_file(&part_path);
        return Err("The downloaded file was damaged and has been removed. Please download it again.".to_string());
    }

    fs::rename(&part_path, &final_path).map_err(|e| format!("Could not save the model: {e}"))?;
    emit_progress(&app, &model, model.size_bytes, "done");
    Ok(path_string(&final_path))
}

async fn fetch_into(
    app: &AppHandle,
    client: &reqwest::Client,
    model: &WhisperModelInfo,
    part_path: &Path,
) -> Result<(), FetchError> {
    let mut start = file_len(part_path).unwrap_or(0);
    if start > model.size_bytes {
        let _ = fs::remove_file(part_path);
        start = 0;
    }
    if start == model.size_bytes {
        return Ok(());
    }

    let mut request = client.get(&model.url);
    if start > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={start}-"));
    }
    let mut response = tokio::time::timeout(SEND_TIMEOUT, request.send())
        .await
        .map_err(|_| FetchError::Retryable("the model host did not respond".into()))?
        .map_err(|e| FetchError::Retryable(format!("could not reach the model host: {e}")))?;

    let status = response.status().as_u16();
    let append = match status {
        206 => true,
        // The host ignored the range request: start the file over.
        200 => false,
        416 => {
            let _ = fs::remove_file(part_path);
            return Err(FetchError::Retryable("restarting the download".into()));
        }
        429 | 500..=599 => {
            return Err(FetchError::Retryable(format!("the model host returned {status}")))
        }
        _ => return Err(FetchError::Fatal(format!("The model host returned {status}."))),
    };

    let mut file = if append {
        OpenOptions::new().create(true).append(true).open(part_path)
    } else {
        File::create(part_path)
    }
    .map_err(|e| FetchError::Fatal(format!("Could not write the model file: {e}")))?;

    let mut received = if append { start } else { 0 };
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    loop {
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            return Err(FetchError::Cancelled);
        }
        let chunk = match tokio::time::timeout(STALL_TIMEOUT, response.chunk()).await {
            Err(_) => return Err(FetchError::Retryable("the connection stalled".into())),
            Ok(Err(e)) => return Err(FetchError::Retryable(format!("download interrupted: {e}"))),
            Ok(Ok(None)) => break,
            Ok(Ok(Some(chunk))) => chunk,
        };
        file.write_all(&chunk)
            .map_err(|e| FetchError::Fatal(format!("Could not write the model file: {e}")))?;
        received += chunk.len() as u64;
        if received > model.size_bytes {
            drop(file);
            let _ = fs::remove_file(part_path);
            return Err(FetchError::Retryable("received more data than expected".into()));
        }
        if last_emit.elapsed() >= Duration::from_millis(200) {
            last_emit = Instant::now();
            emit_progress(app, model, received, "downloading");
        }
    }
    file.flush()
        .map_err(|e| FetchError::Fatal(format!("Could not write the model file: {e}")))?;

    if received < model.size_bytes {
        return Err(FetchError::Retryable("the connection closed early".into()));
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file = File::open(path).map_err(|e| format!("Could not verify the model: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Could not verify the model: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_only_models_are_always_asked_for_english() {
        assert_eq!(effective_language("C:/m/ggml-base.en.bin", Some("fr")), "en");
        assert_eq!(effective_language("C:/m/GGML-SMALL.EN.BIN", None), "en");
    }

    #[test]
    fn multilingual_models_take_the_requested_language_or_detect() {
        assert_eq!(effective_language("C:/m/ggml-base.bin", Some("fr")), "fr");
        assert_eq!(effective_language("C:/m/ggml-base.bin", Some("  ")), "auto");
        assert_eq!(effective_language("C:/m/ggml-base.bin", None), "auto");
    }

    #[test]
    fn known_models_use_their_published_memory_needs() {
        assert_eq!(estimated_ram_mb("C:/anything/ggml-small.en.bin"), 852);
        assert_eq!(estimated_ram_mb("C:/anything/ggml-tiny.bin"), 273);
    }

    #[test]
    fn hashes_a_file_to_lowercase_hex() {
        let dir = std::env::temp_dir().join(format!("bsp-hash-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("abc.txt");
        fs::write(&file, b"abc").unwrap();
        assert_eq!(
            sha256_file(&file).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
