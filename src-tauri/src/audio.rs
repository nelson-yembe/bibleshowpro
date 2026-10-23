//! Microphone capture through Windows audio (WASAPI), outside the web view.
//!
//! The web view's capture depends on its permission prompt, an AudioContext the autoplay
//! policy can leave suspended, and whatever device ids it chooses to expose. Here the
//! device is opened directly, mixed to mono, converted to the rate the engine wants, and
//! streamed to the page as little-endian f32 frames every 100 ms.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};

/// Frames are sent in 100 ms chunks: often enough for streaming, few enough IPC calls.
const CHUNK_MS: u32 = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInfo {
    pub id: u32,
    pub device: String,
    /// The device's own rate, before conversion.
    pub device_rate: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureError {
    id: u32,
    message: String,
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static CAPTURES: Mutex<Option<HashMap<u32, Arc<AtomicBool>>>> = Mutex::new(None);

pub fn list_inputs() -> Result<Vec<InputDevice>, String> {
    let host = cpal::default_host();
    let default = host.default_input_device().and_then(|d| d.name().ok());
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    Ok(devices
        .filter_map(|d| d.name().ok())
        .map(|name| InputDevice {
            is_default: default.as_deref() == Some(name.as_str()),
            name,
        })
        .collect())
}

/// The named input, or the Windows default when it is unplugged or no name was given.
fn find_device(name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(name) = name.filter(|n| !n.is_empty()) {
        if let Ok(devices) = host.input_devices() {
            for device in devices {
                if device.name().is_ok_and(|n| n == name) {
                    return Ok(device);
                }
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| "No microphone found. Plug one in, or enable an input in Windows Sound settings.".to_string())
}

fn friendly_error(error: impl std::fmt::Display) -> String {
    let text = error.to_string();
    if text.contains("0x80070005") || text.to_lowercase().contains("access") {
        "Windows blocked the microphone. Open Settings > Privacy & security > Microphone and allow desktop apps to use it."
            .to_string()
    } else {
        format!("Could not open the microphone: {text}")
    }
}

pub fn start(app: AppHandle, device_name: Option<String>, target_rate: u32, frames: Channel) -> Result<CaptureInfo, String> {
    if !(8_000..=48_000).contains(&target_rate) {
        return Err(format!("Unsupported capture rate {target_rate} Hz."));
    }
    let device = find_device(device_name.as_deref())?;
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(AtomicBool::new(false));
    let (ready_tx, ready_rx) = mpsc::channel::<Result<CaptureInfo, String>>();

    let thread_stop = stop.clone();
    // A cpal stream must stay on the thread that built it, so the capture owns one.
    std::thread::Builder::new()
        .name(format!("audio-capture-{id}"))
        .spawn(move || run(app, id, device, target_rate, frames, thread_stop, ready_tx))
        .map_err(|e| e.to_string())?;

    let info = ready_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "The microphone did not start in time.".to_string())??;
    CAPTURES
        .lock()
        .map_err(|e| e.to_string())?
        .get_or_insert_with(HashMap::new)
        .insert(id, stop);
    Ok(info)
}

pub fn stop(id: u32) {
    let flag = CAPTURES.lock().ok().and_then(|mut c| c.as_mut().and_then(|c| c.remove(&id)));
    if let Some(flag) = flag {
        flag.store(true, Ordering::Relaxed);
    }
}

pub fn stop_all() {
    let flags: Vec<_> = CAPTURES
        .lock()
        .ok()
        .and_then(|mut c| c.take())
        .map(|c| c.into_values().collect())
        .unwrap_or_default();
    for flag in flags {
        flag.store(true, Ordering::Relaxed);
    }
}

fn run(
    app: AppHandle,
    id: u32,
    device: cpal::Device,
    target_rate: u32,
    frames: Channel,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<Result<CaptureInfo, String>>,
) {
    let name = device.name().unwrap_or_else(|_| "Microphone".into());
    let config = match device.default_input_config() {
        Ok(config) => config,
        Err(e) => {
            let _ = ready.send(Err(friendly_error(e)));
            return;
        }
    };
    let device_rate = config.sample_rate().0;
    let channels = usize::from(config.channels().max(1));
    let (tx, rx) = mpsc::channel::<Vec<f32>>();
    let failed: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let stream = match build_stream(&device, &config, channels, tx, failed.clone()) {
        Ok(stream) => stream,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };
    if let Err(e) = stream.play() {
        let _ = ready.send(Err(friendly_error(e)));
        return;
    }
    let _ = ready.send(Ok(CaptureInfo { id, device: name, device_rate }));

    let mut resampler = Resampler::new(device_rate, target_rate);
    let chunk = (target_rate * CHUNK_MS / 1000) as usize;
    let mut pending: Vec<f32> = Vec::with_capacity(chunk * 2);
    while !stop.load(Ordering::Relaxed) {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(mono) => {
                pending.extend(resampler.process(&mono));
                if pending.len() >= chunk {
                    let bytes: Vec<u8> = pending.iter().flat_map(|s| s.to_le_bytes()).collect();
                    pending.clear();
                    if frames.send(InvokeResponseBody::Raw(bytes)).is_err() {
                        break; // The page went away.
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
        if let Some(message) = failed.lock().ok().and_then(|f| f.clone()) {
            let _ = app.emit("audio-capture-error", CaptureError { id, message });
            break;
        }
    }
    drop(stream);
    if let Ok(mut captures) = CAPTURES.lock() {
        if let Some(captures) = captures.as_mut() {
            captures.remove(&id);
        }
    }
}

fn build_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    channels: usize,
    tx: mpsc::Sender<Vec<f32>>,
    failed: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, String> {
    let stream_config: cpal::StreamConfig = config.clone().into();
    let on_error = move |e: cpal::StreamError| {
        if let Ok(mut f) = failed.lock() {
            *f = Some(match e {
                cpal::StreamError::DeviceNotAvailable => "The microphone was unplugged or disabled.".to_string(),
                other => format!("The microphone stopped: {other}"),
            });
        }
    };
    match config.sample_format() {
        SampleFormat::F32 => typed_stream::<f32>(device, &stream_config, channels, tx, on_error),
        SampleFormat::I16 => typed_stream::<i16>(device, &stream_config, channels, tx, on_error),
        SampleFormat::U16 => typed_stream::<u16>(device, &stream_config, channels, tx, on_error),
        SampleFormat::I32 => typed_stream::<i32>(device, &stream_config, channels, tx, on_error),
        other => Err(format!("This microphone delivers {other} audio, which is not supported.")),
    }
}

fn typed_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: usize,
    tx: mpsc::Sender<Vec<f32>>,
    on_error: impl FnMut(cpal::StreamError) + Send + 'static,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(downmix(data, channels));
            },
            on_error,
            None,
        )
        .map_err(friendly_error)
}

/// Interleaved samples of any format → mono f32.
fn downmix<T>(data: &[T], channels: usize) -> Vec<f32>
where
    T: Sample,
    f32: FromSample<T>,
{
    data.chunks(channels)
        .map(|frame| frame.iter().map(|s| f32::from_sample(*s)).sum::<f32>() / frame.len() as f32)
        .collect()
}

/// Streaming rate converter, the same as the web path's: downsampling averages each output
/// sample's span of input (a box filter), upsampling interpolates linearly, and state
/// carries across chunks so boundaries neither click nor drift.
struct Resampler {
    ratio: f64,
    carry: Vec<f32>,
    position: f64,
}

impl Resampler {
    fn new(input_rate: u32, output_rate: u32) -> Self {
        Self {
            ratio: f64::from(input_rate) / f64::from(output_rate),
            carry: Vec::new(),
            position: 0.0,
        }
    }

    fn process(&mut self, input: &[f32]) -> Vec<f32> {
        if self.ratio == 1.0 {
            return input.to_vec();
        }
        let mut buffer = std::mem::take(&mut self.carry);
        buffer.extend_from_slice(input);
        let mut out = Vec::with_capacity((buffer.len() as f64 / self.ratio) as usize + 1);
        if self.ratio > 1.0 {
            while self.position + self.ratio <= buffer.len() as f64 {
                let start = self.position.floor() as usize;
                let end = (self.position + self.ratio).floor() as usize;
                out.push(if end > start {
                    buffer[start..end].iter().sum::<f32>() / (end - start) as f32
                } else {
                    buffer[start]
                });
                self.position += self.ratio;
            }
        } else {
            while self.position + 1.0 < buffer.len() as f64 {
                let index = self.position.floor() as usize;
                let fraction = (self.position - index as f64) as f32;
                out.push(buffer[index] * (1.0 - fraction) + buffer[index + 1] * fraction);
                self.position += self.ratio;
            }
        }
        let consumed = self.position.floor() as usize;
        self.carry = buffer.split_off(consumed.min(buffer.len()));
        self.position -= consumed as f64;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixes_any_sample_format_to_mono() {
        assert_eq!(downmix(&[0.5f32, -0.5, 1.0, 0.0], 2), vec![0.0, 0.5]);
        let quiet = downmix(&[i16::MAX, i16::MAX], 2);
        assert!((quiet[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn converts_48k_to_16k_without_drift_across_chunks() {
        let mut resampler = Resampler::new(48_000, 16_000);
        let mut produced = 0;
        for _ in 0..100 {
            // 10 ms chunks of an uneven size, as a driver delivers them.
            produced += resampler.process(&vec![0.25; 481]).len();
        }
        let expected = 48_100 / 3;
        assert!((produced as i64 - expected as i64).abs() <= 1, "{produced} vs {expected}");
        assert!(resampler.process(&[0.25; 3]).iter().all(|s| (s - 0.25).abs() < 1e-6));
    }

    #[test]
    fn upsamples_a_narrowband_headset() {
        let mut resampler = Resampler::new(8_000, 16_000);
        let out = resampler.process(&[0.0, 1.0, 0.0, 1.0]);
        assert_eq!(out.len(), 6);
        assert!((out[1] - 0.5).abs() < 1e-6);
    }

    /// Needs a real microphone; run with `cargo test audio -- --ignored`.
    #[test]
    #[ignore]
    fn reads_the_default_microphone() {
        let device = find_device(None).unwrap();
        let config = device.default_input_config().unwrap();
        let (tx, rx) = mpsc::channel();
        let failed = Arc::new(Mutex::new(None));
        let stream = build_stream(&device, &config, usize::from(config.channels()), tx, failed.clone()).unwrap();
        stream.play().unwrap();
        let mut resampler = Resampler::new(config.sample_rate().0, 16_000);
        let mut samples = 0;
        let started = std::time::Instant::now();
        while started.elapsed() < Duration::from_secs(1) {
            if let Ok(mono) = rx.recv_timeout(Duration::from_millis(100)) {
                samples += resampler.process(&mono).len();
            }
        }
        drop(stream);
        println!("{}: {} Hz, {} channels → {samples} samples at 16 kHz in 1 s", device.name().unwrap(), config.sample_rate().0, config.channels());
        assert!(failed.lock().unwrap().is_none());
        assert!((14_000..=18_000).contains(&samples), "{samples}");
    }
}
