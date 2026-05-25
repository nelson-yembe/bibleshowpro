use crate::ndi::config::{NdiFeedStatus, NdiOutputConfig, NdiRuntimeStatus};
use bytes::Bytes;
use image::imageops::FilterType;
use once_cell::sync::Lazy;
use oximedia_ndi::{AudioFormat, DiscoveryService, NdiMetadata, NdiSender, SenderConfig, VideoFormat};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const OUTPUT_WINDOW_TITLE: &str = "Bible Show Pro — Output";
const PREVIEW_WINDOW_TITLE: &str = "Bible Show Pro — NDI Preview";

static NDI_RUNNING: AtomicBool = AtomicBool::new(false);
static STATUS: Lazy<Arc<RwLock<NdiRuntimeStatus>>> =
    Lazy::new(|| Arc::new(RwLock::new(NdiRuntimeStatus::default())));

enum WorkerCommand {
    Start {
        app: AppHandle,
        config: NdiOutputConfig,
        reply: mpsc::Sender<Result<NdiRuntimeStatus, String>>,
    },
    Stop {
        reply: mpsc::Sender<Result<NdiRuntimeStatus, String>>,
    },
    PushFrame {
        feed: String,
        width: u32,
        height: u32,
        data: Vec<u8>,
    },
}

struct FeedRuntime {
    sender: Arc<NdiSender>,
    window_title: String,
    status: NdiFeedStatus,
}

struct WorkerState {
    config: NdiOutputConfig,
    program: Option<FeedRuntime>,
    preview: Option<FeedRuntime>,
    started_at: Option<Instant>,
    last_error: Option<String>,
    ipc_program_frame: Option<(u32, u32, Vec<u8>)>,
    ipc_preview_frame: Option<(u32, u32, Vec<u8>)>,
    running: bool,
}

impl Default for WorkerState {
    fn default() -> Self {
        Self {
            config: NdiOutputConfig::default(),
            program: None,
            preview: None,
            started_at: None,
            last_error: None,
            ipc_program_frame: None,
            ipc_preview_frame: None,
            running: false,
        }
    }
}

struct WorkerLoop {
    cmd_rx: Receiver<WorkerCommand>,
    state: WorkerState,
    shutdown: bool,
}

static WORKER_TX: Lazy<Sender<WorkerCommand>> = Lazy::new(|| {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || worker_main(rx));
    tx
});

fn rgba_to_bgra(rgba: &[u8], out: &mut Vec<u8>) {
    out.clear();
    out.reserve(rgba.len());
    for px in rgba.chunks_exact(4) {
        out.push(px[2]);
        out.push(px[1]);
        out.push(px[0]);
        out.push(px[3]);
    }
}

fn capture_window_frame(window_title: &str, width: u32, height: u32) -> Result<Vec<u8>, String> {
    let windows = xcap::Window::all().map_err(|e| e.to_string())?;
    let window = windows
        .into_iter()
        .find(|w| w.title().contains(window_title))
        .ok_or_else(|| format!("Capture window not found: {window_title}"))?;

    let rgba = window.capture_image().map_err(|e| e.to_string())?;
    let resized = if rgba.width() != width || rgba.height() != height {
        image::imageops::resize(&rgba, width, height, FilterType::Triangle)
    } else {
        rgba
    };

    let mut bgra = Vec::with_capacity((width * height * 4) as usize);
    rgba_to_bgra(resized.as_raw(), &mut bgra);
    Ok(bgra)
}

fn silent_audio_chunk(samples: u32, channels: u16) -> Vec<u8> {
    vec![0u8; (samples * channels as u32 * 2) as usize]
}

fn test_pattern_bgra(width: u32, height: u32, frame_index: u64) -> Vec<u8> {
    let mut data = vec![0u8; (width * height * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            let bar = ((x + frame_index as u32 * 8) / 120) % 3;
            let (r, g, b) = match bar {
                0 => (20, 30, 90),
                1 => (120, 90, 20),
                _ => (20, 90, 70),
            };
            data[i] = b;
            data[i + 1] = g;
            data[i + 2] = r;
            data[i + 3] = 255;
        }
    }
    data
}

fn update_feed_status(feed: &mut FeedRuntime, format: &VideoFormat) {
    let stats = feed.sender.stats();
    let tally = feed.sender.tally_state();
    feed.status.active = true;
    feed.status.source_name = feed.sender.source_info().name.clone();
    feed.status.address = Some(feed.sender.address().to_string());
    feed.status.connections = stats.active_connections;
    feed.status.frames_sent = stats.frames_sent;
    feed.status.video_frames = stats.video_frames;
    feed.status.audio_frames = stats.audio_frames;
    feed.status.bitrate = stats.bitrate;
    feed.status.width = format.width;
    feed.status.height = format.height;
    feed.status.tally_program = tally.program;
    feed.status.tally_preview = tally.preview;
}

fn publish_status(state: &WorkerState) {
    let mut status = NdiRuntimeStatus {
        running: state.running,
        error: state.last_error.clone(),
        program: state
            .program
            .as_ref()
            .map(|f| f.status.clone())
            .unwrap_or_default(),
        preview: state
            .preview
            .as_ref()
            .map(|f| f.status.clone())
            .unwrap_or_default(),
        capture_mode: state.config.capture_mode.clone(),
        uptime_ms: state
            .started_at
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0),
    };
    if let Ok(mut guard) = STATUS.write() {
        *guard = status;
    }
}

async fn build_sender(name: String, config: &NdiOutputConfig) -> Result<Arc<NdiSender>, String> {
    let mut sender_config = SenderConfig {
        name,
        groups: if config.groups.is_empty() {
            vec!["Bible Show Pro".to_string()]
        } else {
            config.groups.clone()
        },
        port: config.port,
        max_connections: config.max_connections,
        enable_audio: config.enable_audio,
        enable_video: true,
        enable_metadata: config.enable_metadata,
        enable_tally: config.enable_tally,
        enable_ptz: config.enable_ptz,
        enable_bandwidth_adaptation: config.enable_bandwidth_adaptation,
        ..SenderConfig::default()
    };

    NdiSender::new(sender_config)
        .await
        .map(Arc::new)
        .map_err(|e| e.to_string())
}

async fn ensure_preview_surface(app: &AppHandle, width: u32, height: u32) -> Result<(), String> {
    if app.get_webview_window("ndi-preview").is_some() {
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        "ndi-preview",
        WebviewUrl::App("output.html?ndi=preview".into()),
    )
    .title(PREVIEW_WINDOW_TITLE)
    .decorations(false)
    .visible(false)
    .skip_taskbar(true)
    .inner_size(width as f64, height as f64)
    .position(-10000.0, -10000.0)
    .build()
    .map_err(|e| e.to_string())?;

    window.set_focus().ok();
    Ok(())
}

async fn prepare_surfaces(app: &AppHandle, config: &NdiOutputConfig) -> Result<(), String> {
    if config.auto_open_output_when_starting && config.capture_mode != "ipc_frames" {
        let _ = crate::output::ensure_output_window(app.clone()).await;
    }

    if config.enable_preview_output && config.capture_mode != "ipc_frames" {
        ensure_preview_surface(app, config.width, config.height).await?;
        crate::output::replay_stored_preview(app);
    }

    Ok(())
}

async fn stop_senders(state: &mut WorkerState) {
    if let Some(feed) = state.program.take() {
        let _ = feed.sender.shutdown().await;
    }
    if let Some(feed) = state.preview.take() {
        let _ = feed.sender.shutdown().await;
    }
    state.running = false;
    state.started_at = None;
    NDI_RUNNING.store(false, Ordering::SeqCst);
}

async fn tick_frame(state: &mut WorkerState, frame_index: u64) {
    let config = state.config.clone();
    let format = config.video_format();
    let capture_mode = config.capture_mode.clone();

    let mut program_frame: Option<Vec<u8>> = None;
    let mut preview_frame: Option<Vec<u8>> = None;

    if capture_mode == "ipc_frames" {
        if let Some((w, h, data)) = state.ipc_program_frame.clone() {
            if w == config.width && h == config.height {
                program_frame = Some(data);
            }
        }
        if config.enable_preview_output {
            if let Some((w, h, data)) = state.ipc_preview_frame.clone() {
                if w == config.width && h == config.height {
                    preview_frame = Some(data);
                }
            }
        }
    } else if let Some(title) = state.program.as_ref().map(|f| f.window_title.clone()) {
        match capture_window_frame(&title, config.width, config.height) {
            Ok(data) => program_frame = Some(data),
            Err(error) => {
                if config.show_test_pattern_when_idle {
                    program_frame =
                        Some(test_pattern_bgra(config.width, config.height, frame_index));
                } else {
                    state.last_error = Some(error);
                }
            }
        }
    } else if config.show_test_pattern_when_idle {
        program_frame = Some(test_pattern_bgra(config.width, config.height, frame_index));
    }

    if config.enable_preview_output {
        if let Some(title) = state.preview.as_ref().map(|f| f.window_title.clone()) {
            if let Ok(data) = capture_window_frame(&title, config.width, config.height) {
                preview_frame = Some(data);
            }
        }
    }

    if let (Some(feed), Some(data)) = (state.program.as_mut(), program_frame) {
        let stride = config.width * 4;
        if feed
            .sender
            .send_video_frame(format, Bytes::from(data), stride)
            .await
            .is_ok()
        {
            update_feed_status(feed, &format);
            if config.enable_audio && feed.sender.stats().active_connections > 0 {
                let audio_format = AudioFormat::stereo_48k();
                let samples = 1600u32;
                let audio = silent_audio_chunk(samples, audio_format.channels);
                let _ = feed
                    .sender
                    .send_audio_frame(audio_format, Bytes::from(audio), samples)
                    .await;
            }
        }
    }

    if config.enable_preview_output {
        if let (Some(feed), Some(data)) = (state.preview.as_mut(), preview_frame) {
            let stride = config.width * 4;
            if feed
                .sender
                .send_video_frame(format, Bytes::from(data), stride)
                .await
                .is_ok()
            {
                update_feed_status(feed, &format);
            }
        }
    }

    if config.enable_metadata {
        if let Some(feed) = state.program.as_ref() {
            let mut meta = NdiMetadata::new();
            meta.insert("product".to_string(), "Bible Show Pro".to_string());
            meta.insert("version".to_string(), "1.1.0".to_string());
            meta.insert("frame".to_string(), frame_index.to_string());
            let _ = feed.sender.send_metadata(meta).await;
        }
    }

    publish_status(state);
}

fn worker_main(rx: Receiver<WorkerCommand>) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("NDI worker runtime");

    rt.block_on(async {
        let mut loop_state = WorkerLoop {
            cmd_rx: rx,
            state: WorkerState::default(),
            shutdown: false,
        };

        while !loop_state.shutdown {
            while let Ok(cmd) = loop_state.cmd_rx.try_recv() {
                match cmd {
                    WorkerCommand::Start { app, config, reply } => {
                        let result = async {
                            if loop_state.state.running {
                                stop_senders(&mut loop_state.state).await;
                            }

                            prepare_surfaces(&app, &config).await?;

                            let program_sender =
                                build_sender(config.program_source_name.clone(), &config).await?;
                            let preview_sender = if config.enable_preview_output {
                                Some(build_sender(config.preview_source_name.clone(), &config).await?)
                            } else {
                                None
                            };

                            loop_state.state.config = config;
                            loop_state.state.program = Some(FeedRuntime {
                                sender: program_sender,
                                window_title: OUTPUT_WINDOW_TITLE.to_string(),
                                status: NdiFeedStatus {
                                    active: true,
                                    source_name: loop_state.state.config.program_source_name.clone(),
                                    width: loop_state.state.config.width,
                                    height: loop_state.state.config.height,
                                    ..Default::default()
                                },
                            });
                            loop_state.state.preview = preview_sender.map(|sender| FeedRuntime {
                                sender,
                                window_title: PREVIEW_WINDOW_TITLE.to_string(),
                                status: NdiFeedStatus {
                                    active: true,
                                    source_name: loop_state.state.config.preview_source_name.clone(),
                                    width: loop_state.state.config.width,
                                    height: loop_state.state.config.height,
                                    ..Default::default()
                                },
                            });
                            loop_state.state.running = true;
                            loop_state.state.started_at = Some(Instant::now());
                            loop_state.state.last_error = None;
                            NDI_RUNNING.store(true, Ordering::SeqCst);
                            publish_status(&loop_state.state);
                            Ok(get_status()?)
                        }
                        .await;
                        let _ = reply.send(result);
                    }
                    WorkerCommand::Stop { reply } => {
                        stop_senders(&mut loop_state.state).await;
                        publish_status(&loop_state.state);
                        let _ = reply.send(get_status());
                    }
                    WorkerCommand::PushFrame {
                        feed,
                        width,
                        height,
                        data,
                    } => {
                        match feed.as_str() {
                            "program" => {
                                loop_state.state.ipc_program_frame = Some((width, height, data))
                            }
                            "preview" => {
                                loop_state.state.ipc_preview_frame = Some((width, height, data))
                            }
                            _ => {}
                        }
                    }
                }
            }

            if loop_state.state.running {
                static FRAME: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                let frame_index = FRAME.fetch_add(1, Ordering::Relaxed);
                tick_frame(&mut loop_state.state, frame_index).await;
                let interval = loop_state.state.config.frame_interval_ms().max(1);
                tokio::time::sleep(Duration::from_millis(interval)).await;
            } else {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    });
}

fn send_command<F>(build: F) -> Result<NdiRuntimeStatus, String>
where
    F: FnOnce(mpsc::Sender<Result<NdiRuntimeStatus, String>>) -> WorkerCommand,
{
    let (reply_tx, reply_rx) = mpsc::channel();
    WORKER_TX
        .send(build(reply_tx))
        .map_err(|e| format!("NDI worker unavailable: {e}"))?;
    reply_rx
        .recv_timeout(Duration::from_secs(8))
        .map_err(|e| format!("NDI worker timeout: {e}"))?
}

pub async fn start(app: AppHandle, config: NdiOutputConfig) -> Result<NdiRuntimeStatus, String> {
    send_command(|reply| WorkerCommand::Start { app, config, reply })
}

pub fn stop_sync() -> Result<NdiRuntimeStatus, String> {
    send_command(|reply| WorkerCommand::Stop { reply })
}

pub async fn stop() -> Result<NdiRuntimeStatus, String> {
    stop_sync()
}

pub fn get_status() -> Result<NdiRuntimeStatus, String> {
    STATUS
        .read()
        .map(|guard| guard.clone())
        .map_err(|e| e.to_string())
}

pub fn push_ipc_frame(feed: &str, width: u32, height: u32, data: Vec<u8>) -> Result<(), String> {
    WORKER_TX
        .send(WorkerCommand::PushFrame {
            feed: feed.to_string(),
            width,
            height,
            data,
        })
        .map_err(|e| e.to_string())
}

pub fn discover_sources_sync(
    timeout_ms: u64,
) -> Result<Vec<crate::ndi::config::NdiDiscoveredSource>, String> {
    let sources = tauri::async_runtime::block_on(async {
        let discovery = DiscoveryService::new().map_err(|e| e.to_string())?;
        discovery
            .discover(Duration::from_millis(timeout_ms.max(500)))
            .await
            .map_err(|e| e.to_string())
    })?;

    Ok(sources
        .into_iter()
        .map(|s| crate::ndi::config::NdiDiscoveredSource {
            id: s.id.to_string(),
            name: s.name,
            address: s.address.to_string(),
            groups: s.groups,
            has_audio: s.has_audio,
            has_video: s.has_video,
            has_metadata: s.has_metadata,
        })
        .collect())
}
