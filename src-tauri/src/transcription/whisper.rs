use base64::{engine::general_purpose::STANDARD, Engine as _};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// whisper.cpp only accepts 16 kHz mono; the frontend captures at exactly this rate.
pub const WHISPER_SAMPLE_RATE: u32 = 16000;

struct LoadedModel {
    path: String,
    ctx: WhisperContext,
}

/// Loading a model costs seconds and hundreds of megabytes, so keep one resident and
/// only swap it when the operator points at a different file.
static MODEL: Lazy<Mutex<Option<LoadedModel>>> = Lazy::new(|| Mutex::new(None));

pub fn load_model(model_path: &str) -> Result<(), String> {
    let mut guard = MODEL.lock();
    if guard.as_ref().map(|m| m.path.as_str()) == Some(model_path) {
        return Ok(());
    }
    if !std::path::Path::new(model_path).exists() {
        return Err(format!("Whisper model not found at {model_path}"));
    }
    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .map_err(|e| format!("Could not load Whisper model: {e}"))?;
    *guard = Some(LoadedModel {
        path: model_path.to_string(),
        ctx,
    });
    Ok(())
}

fn decode_pcm16(pcm_base64: &str) -> Result<Vec<f32>, String> {
    let bytes = STANDARD
        .decode(pcm_base64)
        .map_err(|e| format!("Could not decode audio: {e}"))?;
    Ok(bytes
        .chunks_exact(2)
        .map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32768.0)
        .collect())
}

pub fn transcribe(model_path: &str, sample_rate: u32, pcm_base64: &str) -> Result<String, String> {
    if sample_rate != WHISPER_SAMPLE_RATE {
        return Err(format!(
            "Whisper needs {WHISPER_SAMPLE_RATE} Hz audio, received {sample_rate} Hz"
        ));
    }
    load_model(model_path)?;

    let samples = decode_pcm16(pcm_base64)?;
    if samples.is_empty() {
        return Ok(String::new());
    }

    let guard = MODEL.lock();
    let model = guard
        .as_ref()
        .ok_or_else(|| "Whisper model is not loaded".to_string())?;

    let mut state = model
        .ctx
        .create_state()
        .map_err(|e| format!("Could not start Whisper: {e}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    state
        .full(params, &samples)
        .map_err(|e| format!("Whisper failed on this segment: {e}"))?;

    let mut out = String::new();
    for index in 0..state.full_n_segments() {
        let Some(segment) = state.get_segment(index) else {
            continue;
        };
        // Lossy: real services produce the odd invalid byte, and dropping the whole
        // segment over one would lose a sentence.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_audio_at_the_wrong_rate() {
        let err = transcribe("model.bin", 44100, "").unwrap_err();
        assert!(err.contains("16000"));
    }

    #[test]
    fn reports_a_missing_model_file() {
        let err = load_model("definitely-not-a-real-model.bin").unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn decodes_little_endian_pcm_to_unit_floats() {
        // 0x7fff and 0x8000 little-endian: full positive then full negative.
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
}
