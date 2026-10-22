//! Offline transcription runs in a child copy of this executable.
//!
//! whisper.cpp is native code. An instruction the processor lacks, an allocation it
//! cannot satisfy or a damaged model takes its whole process down — and in-process, that
//! process is the presentation app, mid-service. Out of process it is a worker: when it
//! dies, the app reports what happened and starts a fresh one on the next request.
//!
//! The protocol is one JSON object per line on stdin and one reply per line on stdout.
//! whisper.cpp's own logging goes to stderr, which the parent sends to a log file.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::Duration;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::transcription::system::{cpu_support, unsupported_cpu_message, CpuSupport};
use crate::transcription::whisper::{decode_pcm16, WhisperEngine, WHISPER_SAMPLE_RATE};

/// Command-line flag that makes the executable run as a worker instead of the app.
pub const WORKER_FLAG: &str = "--whisper-worker";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum WorkerRequest {
    #[serde(rename_all = "camelCase")]
    Load { path: String },
    #[serde(rename_all = "camelCase")]
    Transcribe {
        pcm_base64: String,
        sample_rate: u32,
        language: String,
        threads: i32,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkerResponse {
    pub ok: bool,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub error: Option<String>,
}

impl WorkerResponse {
    fn ok(text: impl Into<String>) -> Self {
        Self {
            ok: true,
            text: text.into(),
            error: None,
        }
    }

    fn err(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            text: String::new(),
            error: Some(message.into()),
        }
    }
}

// ---------------------------------------------------------------------------------
// Child side
// ---------------------------------------------------------------------------------

/// Entry point when launched with [`WORKER_FLAG`]. Returns the process exit code.
pub fn run_worker() -> i32 {
    let cpu = cpu_support();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let mut engine: Option<WhisperEngine> = None;

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<WorkerRequest>(&line) {
            Ok(request) => handle(request, &mut engine, &cpu),
            Err(e) => WorkerResponse::err(format!("Bad request to the offline engine: {e}")),
        };
        let Ok(json) = serde_json::to_string(&response) else { break };
        if writeln!(stdout, "{json}").is_err() || stdout.flush().is_err() {
            break;
        }
    }
    0
}

pub(crate) fn handle(
    request: WorkerRequest,
    engine: &mut Option<WhisperEngine>,
    cpu: &CpuSupport,
) -> WorkerResponse {
    match request {
        WorkerRequest::Ping => WorkerResponse::ok(""),
        WorkerRequest::Load { path } => {
            // Belt and braces: the parent checks too, but the worker must never execute
            // an instruction the CPU cannot decode.
            if !cpu.supported {
                return WorkerResponse::err(unsupported_cpu_message(&cpu.missing));
            }
            if engine.as_ref().map(|e| e.path()) == Some(path.as_str()) {
                return WorkerResponse::ok("");
            }
            // Free the old model before loading the new one — on a 4 GB machine two
            // resident models is the difference between working and not.
            *engine = None;
            match WhisperEngine::load(&path) {
                Ok(loaded) => {
                    *engine = Some(loaded);
                    WorkerResponse::ok("")
                }
                Err(message) => WorkerResponse::err(message),
            }
        }
        WorkerRequest::Transcribe {
            pcm_base64,
            sample_rate,
            language,
            threads,
        } => {
            let Some(loaded) = engine.as_ref() else {
                return WorkerResponse::err("No Whisper model is loaded.");
            };
            if sample_rate != WHISPER_SAMPLE_RATE {
                return WorkerResponse::err(format!(
                    "Whisper needs {WHISPER_SAMPLE_RATE} Hz audio, received {sample_rate} Hz"
                ));
            }
            let samples = match decode_pcm16(&pcm_base64) {
                Ok(samples) => samples,
                Err(message) => return WorkerResponse::err(message),
            };
            match loaded.transcribe(&samples, &language, threads) {
                Ok(text) => WorkerResponse::ok(text),
                Err(message) => WorkerResponse::err(message),
            }
        }
    }
}

// ---------------------------------------------------------------------------------
// Parent side
// ---------------------------------------------------------------------------------

struct WorkerProcess {
    child: Child,
    stdin: ChildStdin,
    replies: Receiver<String>,
    loaded_path: Option<String>,
}

static WORKER: Lazy<Mutex<Option<WorkerProcess>>> = Lazy::new(|| Mutex::new(None));

const LOAD_TIMEOUT: Duration = Duration::from_secs(180);

/// Time allowed for one segment: generous, because a slow PC on the small model can run
/// several times slower than real time, but bounded so a hung worker cannot stall forever.
pub fn transcribe_timeout(audio_seconds: f64) -> Duration {
    let secs = 30.0 + audio_seconds.max(0.0) * 8.0;
    Duration::from_secs_f64(secs.min(600.0))
}

/// Seconds of audio in a base64 PCM16 payload, from its length alone.
pub fn audio_seconds_in(pcm_base64: &str, sample_rate: u32) -> f64 {
    let bytes = pcm_base64.len() as f64 * 3.0 / 4.0;
    bytes / 2.0 / f64::from(sample_rate.max(1))
}

/// Turn a worker's exit status into something an operator can act on.
pub fn describe_exit(code: Option<i32>) -> String {
    match code.map(|c| c as u32) {
        Some(0xC000_001D) => {
            "This PC's processor is missing instructions the offline engine needs. Use Gemini (online) instead.".to_string()
        }
        Some(0xC000_0017) | Some(0xC000_012D) => {
            "The offline engine ran out of memory. Choose a smaller model or close other programs.".to_string()
        }
        Some(0xC000_0005) | Some(0xC000_0409) | Some(0xC000_00FD) => {
            "The offline engine crashed. Try again; if it keeps happening, choose a smaller model.".to_string()
        }
        Some(0) => "The offline engine stopped.".to_string(),
        Some(other) => format!("The offline engine stopped unexpectedly (code 0x{other:08X})."),
        None => "The offline engine stopped unexpectedly.".to_string(),
    }
}

fn spawn(log_path: Option<&Path>) -> Result<WorkerProcess, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Could not locate the app to start the offline engine: {e}"))?;
    let mut command = Command::new(exe);
    command
        .arg(WORKER_FLAG)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped());
    match log_path.and_then(|p| std::fs::File::create(p).ok()) {
        Some(file) => command.stderr(Stdio::from(file)),
        None => command.stderr(Stdio::null()),
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start the offline transcription engine: {e}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "The offline engine has no input channel.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "The offline engine has no output channel.".to_string())?;

    // A reader thread, so replies can be awaited with a timeout instead of blocking on
    // a read that a hung worker would never complete.
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if tx.send(line).is_err() {
                break;
            }
        }
    });

    Ok(WorkerProcess {
        child,
        stdin,
        replies: rx,
        loaded_path: None,
    })
}

/// Reap a dead or hung worker and explain what happened.
fn bury(slot: &mut Option<WorkerProcess>) -> String {
    let Some(mut worker) = slot.take() else {
        return describe_exit(None);
    };
    for _ in 0..20 {
        if let Ok(Some(status)) = worker.child.try_wait() {
            return describe_exit(status.code());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = worker.child.kill();
    let _ = worker.child.wait();
    describe_exit(None)
}

fn call(
    slot: &mut Option<WorkerProcess>,
    request: &WorkerRequest,
    timeout: Duration,
    log_path: Option<&Path>,
) -> Result<String, String> {
    if slot.is_none() {
        *slot = Some(spawn(log_path)?);
    }
    let worker = slot.as_mut().expect("worker was just ensured");
    let line = serde_json::to_string(request).map_err(|e| e.to_string())?;
    if writeln!(worker.stdin, "{line}").and_then(|_| worker.stdin.flush()).is_err() {
        return Err(bury(slot));
    }
    match worker.replies.recv_timeout(timeout) {
        Ok(reply) => {
            let response: WorkerResponse = serde_json::from_str(&reply)
                .map_err(|e| format!("Unreadable reply from the offline engine: {e}"))?;
            if response.ok {
                Ok(response.text)
            } else {
                Err(response.error.unwrap_or_else(|| "The offline engine reported an error.".into()))
            }
        }
        Err(RecvTimeoutError::Timeout) => {
            bury(slot);
            Err("The offline engine took too long and was restarted. Choose a smaller model on this PC.".into())
        }
        Err(RecvTimeoutError::Disconnected) => Err(bury(slot)),
    }
}

fn ensure_loaded_in(
    slot: &mut Option<WorkerProcess>,
    path: &str,
    log_path: Option<&Path>,
) -> Result<(), String> {
    if slot.as_ref().and_then(|w| w.loaded_path.as_deref()) == Some(path) {
        return Ok(());
    }
    call(
        slot,
        &WorkerRequest::Load {
            path: path.to_string(),
        },
        LOAD_TIMEOUT,
        log_path,
    )?;
    if let Some(worker) = slot.as_mut() {
        worker.loaded_path = Some(path.to_string());
    }
    Ok(())
}

/// Start the worker if needed and make sure `path` is the resident model.
pub fn ensure_loaded(path: &str, log_path: Option<&Path>) -> Result<(), String> {
    let mut slot = WORKER.lock();
    ensure_loaded_in(&mut slot, path, log_path)
}

/// Transcribe one segment. Reloads the model first if the worker had to be restarted.
pub fn transcribe(
    path: &str,
    pcm_base64: String,
    sample_rate: u32,
    language: String,
    threads: i32,
    log_path: Option<&Path>,
) -> Result<String, String> {
    let mut slot = WORKER.lock();
    ensure_loaded_in(&mut slot, path, log_path)?;
    let timeout = transcribe_timeout(audio_seconds_in(&pcm_base64, sample_rate));
    call(
        &mut slot,
        &WorkerRequest::Transcribe {
            pcm_base64,
            sample_rate,
            language,
            threads,
        },
        timeout,
        log_path,
    )
}

/// The path of the model currently resident in the worker, if any.
pub fn loaded_path() -> Option<String> {
    WORKER.lock().as_ref().and_then(|w| w.loaded_path.clone())
}

/// Stop the worker and free the model's memory. Safe to call when none is running.
pub fn shutdown() {
    let mut slot = WORKER.lock();
    if let Some(mut worker) = slot.take() {
        let _ = worker.child.kill();
        let _ = worker.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn supported() -> CpuSupport {
        CpuSupport {
            supported: true,
            missing: vec![],
        }
    }

    #[test]
    fn requests_round_trip_as_tagged_json() {
        let request = WorkerRequest::Transcribe {
            pcm_base64: "AAA=".into(),
            sample_rate: 16000,
            language: "en".into(),
            threads: 3,
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"op\":\"transcribe\""));
        assert!(json.contains("\"pcmBase64\":\"AAA=\""));
        assert!(json.contains("\"sampleRate\":16000"));
        let back: WorkerRequest = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, WorkerRequest::Transcribe { threads: 3, .. }));
    }

    #[test]
    fn ping_answers_without_a_model() {
        let mut engine = None;
        assert_eq!(handle(WorkerRequest::Ping, &mut engine, &supported()), WorkerResponse::ok(""));
    }

    #[test]
    fn transcribe_without_a_model_is_an_error_not_a_crash() {
        let mut engine = None;
        let response = handle(
            WorkerRequest::Transcribe {
                pcm_base64: String::new(),
                sample_rate: 16000,
                language: "en".into(),
                threads: 1,
            },
            &mut engine,
            &supported(),
        );
        assert!(!response.ok);
        assert!(response.error.unwrap().contains("No Whisper model"));
    }

    #[test]
    fn load_refuses_on_an_unsupported_cpu_before_touching_whisper() {
        let mut engine = None;
        let cpu = CpuSupport {
            supported: false,
            missing: vec!["AVX2".into()],
        };
        let response = handle(
            WorkerRequest::Load {
                path: "anything.bin".into(),
            },
            &mut engine,
            &cpu,
        );
        assert!(!response.ok);
        assert!(response.error.unwrap().contains("AVX2"));
    }

    #[test]
    fn load_reports_a_missing_file() {
        let mut engine = None;
        let response = handle(
            WorkerRequest::Load {
                path: "no-such-model.bin".into(),
            },
            &mut engine,
            &supported(),
        );
        assert!(!response.ok);
        assert!(engine.is_none());
    }

    #[test]
    fn explains_the_crashes_we_have_seen() {
        assert!(describe_exit(Some(0xC000_001Du32 as i32)).contains("processor"));
        assert!(describe_exit(Some(0xC000_0017u32 as i32)).contains("memory"));
        assert!(describe_exit(Some(0xC000_0005u32 as i32)).contains("crashed"));
        assert!(describe_exit(Some(0x1234)).contains("0x00001234"));
        assert!(describe_exit(None).contains("unexpectedly"));
    }

    #[test]
    fn timeouts_scale_with_audio_but_stay_bounded() {
        assert_eq!(transcribe_timeout(0.0), Duration::from_secs(30));
        assert_eq!(transcribe_timeout(10.0), Duration::from_secs(110));
        assert_eq!(transcribe_timeout(10_000.0), Duration::from_secs(600));
    }

    #[test]
    fn audio_length_is_derived_from_payload_size() {
        // 16000 samples × 2 bytes = 32000 bytes ≈ 42667 base64 chars → 1 second.
        let one_second = "A".repeat(42_667);
        let secs = audio_seconds_in(&one_second, 16000);
        assert!((secs - 1.0).abs() < 0.01, "got {secs}");
    }
}
