//! whisper.cpp inference. Runs only inside the worker process (see worker.rs), so a
//! native fault here never reaches the presentation app.

use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// whisper.cpp only accepts 16 kHz mono; the frontend resamples to exactly this.
pub const WHISPER_SAMPLE_RATE: u32 = 16000;

pub struct WhisperEngine {
    path: String,
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn load(path: &str) -> Result<Self, String> {
        let file = Path::new(path);
        if !file.exists() {
            return Err(format!("Whisper model not found at {path}"));
        }
        let params = WhisperContextParameters::default();
        let ctx = if path.is_ascii() {
            WhisperContext::new_with_params(path, params)
        } else {
            // whisper.cpp opens files with a narrow-character fopen on Windows, which
            // cannot represent an accented user name in the path. Rust reads it fine.
            let bytes = std::fs::read(file).map_err(|e| format!("Could not read Whisper model: {e}"))?;
            WhisperContext::new_from_buffer_with_params(&bytes, params)
        }
        .map_err(|e| format!("Could not load Whisper model — the file may be damaged ({e})"))?;
        Ok(Self {
            path: path.to_string(),
            ctx,
        })
    }

    pub fn path(&self) -> &str {
        &self.path
    }

    /// `language` is an ISO code ("en", "fr") or "auto" to let the model decide.
    pub fn transcribe(&self, samples: &[f32], language: &str, threads: i32) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| format!("Could not start Whisper: {e}"))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(threads.max(1));
        params.set_translate(false);
        params.set_language(Some(language));
        // Each segment stands alone: feeding earlier text back in is what makes Whisper
        // loop on a phrase or invent continuations during pauses.
        params.set_no_context(true);
        params.set_no_timestamps(true);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper failed on this segment: {e}"))?;

        let mut out = String::new();
        for index in 0..state.full_n_segments() {
            let Some(segment) = state.get_segment(index) else {
                continue;
            };
            let text = segment
                .to_str_lossy()
                .map_err(|e| format!("Could not read Whisper output: {e}"))?;
            let trimmed = text.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !out.is_empty() {
                out.push(' ');
            }
            out.push_str(trimmed);
        }
        Ok(out)
    }
}

pub fn decode_pcm16(pcm_base64: &str) -> Result<Vec<f32>, String> {
    let bytes = STANDARD
        .decode(pcm_base64)
        .map_err(|e| format!("Could not decode audio: {e}"))?;
    Ok(bytes
        .chunks_exact(2)
        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32768.0)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_a_missing_model_file() {
        let err = WhisperEngine::load("definitely-not-a-real-model.bin").err().unwrap();
        assert!(err.contains("not found"));
    }

    #[test]
    fn decodes_little_endian_pcm_to_unit_floats() {
        let encoded = STANDARD.encode([0xff, 0x7f, 0x00, 0x80]);
        let samples = decode_pcm16(&encoded).unwrap();
        assert_eq!(samples.len(), 2);
        assert!((samples[0] - 0.999_969_5).abs() < 1e-5);
        assert!((samples[1] + 1.0).abs() < 1e-5);
    }

    #[test]
    fn ignores_a_trailing_odd_byte_rather_than_panicking() {
        let encoded = STANDARD.encode([0x00, 0x00, 0x01]);
        assert_eq!(decode_pcm16(&encoded).unwrap().len(), 1);
    }

    #[test]
    fn rejects_malformed_base64() {
        assert!(decode_pcm16("not base64!!").is_err());
    }
}
