//! whisper.cpp inference. Runs only inside the worker process (see worker.rs), so a
//! native fault here never reaches the presentation app.

use std::ops::Range;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperVadContext,
    WhisperVadContextParams, WhisperVadParams,
};

/// whisper.cpp only accepts 16 kHz mono; the frontend resamples to exactly this.
pub const WHISPER_SAMPLE_RATE: u32 = 16000;

/// Audio kept either side of detected speech, so the edges of words are not clipped.
const SPEECH_PAD_SECONDS: f32 = 0.2;

/// Primes decoding with the vocabulary of a scripture reference. Without it, an accented
/// "James chapter four verse five" came back from the base model as "James chapter 4
/// was 5" and detection never saw the reference.
///
/// Kept short: longer prompts made the small model stop transcribing after its first
/// sentence. It names no actual reference, because Whisper sometimes echoes its prompt
/// and an echoed "John 3:16" would be a hallucinated verse sent to the projector.
pub fn scripture_prompt(language: &str) -> Option<&'static str> {
    match language {
        "en" => Some("Bible reading: book, chapter, verse."),
        "fr" => Some("Lecture biblique : livre, chapitre, verset."),
        _ => None,
    }
}

fn normalize(text: &str) -> String {
    text.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// True when the output is the prompt coming back rather than anything said.
pub fn is_prompt_echo(output: &str, prompt: &str) -> bool {
    let output = normalize(output);
    if output.is_empty() {
        return false;
    }
    let prompt = normalize(prompt);
    output == prompt || (output.len() >= 12 && prompt.contains(&output))
}

/// Merges detected speech (centisecond timestamps, as Silero reports them) into one
/// padded range of samples. Pauses between phrases stay in: they are part of how a
/// reference is read.
pub fn speech_span(
    segments: impl IntoIterator<Item = (f32, f32)>,
    n_samples: usize,
) -> Option<Range<usize>> {
    let rate = WHISPER_SAMPLE_RATE as f32;
    let to_sample = |cs: f32| ((cs / 100.0) * rate).max(0.0) as usize;
    let pad = (SPEECH_PAD_SECONDS * rate) as usize;

    let mut span: Option<(usize, usize)> = None;
    for (start, end) in segments {
        let (start, end) = (to_sample(start), to_sample(end));
        if end <= start {
            continue;
        }
        span = Some(match span {
            Some((first, last)) => (first.min(start), last.max(end)),
            None => (start, end),
        });
    }
    let (start, end) = span?;
    let range = start.saturating_sub(pad)..(end + pad).min(n_samples);
    (!range.is_empty()).then_some(range)
}

/// Silero voice-activity detection, bundled with the installer. Whisper writes something
/// for any audio it is handed — "you" for a cough, "The book of Revelation." for hiss —
/// so audio with no speech in it never reaches Whisper.
pub struct SpeechDetector {
    ctx: WhisperVadContext,
}

impl SpeechDetector {
    pub fn load(path: &str) -> Result<Self, String> {
        if !Path::new(path).exists() {
            return Err(format!("Speech detector not found at {path}"));
        }
        let mut params = WhisperVadContextParams::new();
        params.set_n_threads(1);
        WhisperVadContext::new(path, params)
            .map(|ctx| Self { ctx })
            .map_err(|e| format!("Could not load the speech detector ({e})"))
    }

    /// The part of `samples` holding speech, or `None` when nobody is speaking.
    pub fn find_speech(&mut self, samples: &[f32]) -> Result<Option<Range<usize>>, String> {
        let segments = self
            .ctx
            .segments_from_samples(WhisperVadParams::new(), samples)
            .map_err(|e| format!("Speech detection failed ({e})"))?;
        Ok(speech_span(segments.map(|s| (s.start, s.end)), samples.len()))
    }
}

pub struct WhisperEngine {
    path: String,
    ctx: WhisperContext,
    detector: Option<SpeechDetector>,
}

impl WhisperEngine {
    /// Without a detector (a bare development build) every segment goes to Whisper.
    pub fn load(path: &str, detector_path: Option<&str>) -> Result<Self, String> {
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

        // A detector that will not load costs accuracy, not transcription: carry on without.
        let detector = detector_path.and_then(|p| {
            SpeechDetector::load(p)
                .inspect_err(|e| eprintln!("{e}; transcribing without it"))
                .ok()
        });
        Ok(Self {
            path: path.to_string(),
            ctx,
            detector,
        })
    }

    pub fn path(&self) -> &str {
        &self.path
    }

    pub fn has_detector(&self) -> bool {
        self.detector.is_some()
    }

    /// `language` is an ISO code ("en", "fr") or "auto" to let the model decide.
    pub fn transcribe(&mut self, samples: &[f32], language: &str, threads: i32) -> Result<String, String> {
        if samples.is_empty() {
            return Ok(String::new());
        }
        let samples = match self.detector.as_mut().map(|d| d.find_speech(samples)) {
            Some(Ok(Some(span))) => &samples[span],
            Some(Ok(None)) => return Ok(String::new()),
            // Never lose speech to a detector fault: give Whisper everything instead.
            Some(Err(e)) => {
                eprintln!("{e}");
                samples
            }
            None => samples,
        };

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
        let prompt = scripture_prompt(language);
        if let Some(prompt) = prompt {
            params.set_initial_prompt(prompt);
        }

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
            if prompt.is_some_and(|p| is_prompt_echo(trimmed, p)) {
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
        let err = WhisperEngine::load("definitely-not-a-real-model.bin", None).err().unwrap();
        assert!(err.contains("not found"));
    }

    #[test]
    fn reports_a_missing_speech_detector() {
        let err = SpeechDetector::load("definitely-not-a-real-detector.bin").err().unwrap();
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

    #[test]
    fn prompts_name_the_structure_but_no_actual_reference() {
        for lang in ["en", "fr"] {
            let prompt = scripture_prompt(lang).unwrap();
            assert!(!prompt.chars().any(|c| c.is_ascii_digit()), "{lang} prompt must not contain a reference");
        }
        assert!(scripture_prompt("auto").is_none());
    }

    #[test]
    fn recognises_the_prompt_coming_back() {
        let prompt = scripture_prompt("en").unwrap();
        assert!(is_prompt_echo(prompt, prompt));
        assert!(is_prompt_echo("Bible reading.", prompt));
        assert!(is_prompt_echo("  book, CHAPTER, verse ", prompt));
    }

    #[test]
    fn never_mistakes_real_speech_for_an_echo() {
        let prompt = scripture_prompt("en").unwrap();
        assert!(!is_prompt_echo("Turn with me to John chapter 3 verse 16", prompt));
        assert!(!is_prompt_echo("James chapter 4 verse 5", prompt));
        assert!(!is_prompt_echo("the book", prompt), "short fragments are too common to drop");
        assert!(!is_prompt_echo("", prompt));
    }

    #[test]
    fn no_detected_speech_means_nothing_to_transcribe() {
        assert_eq!(speech_span([], 16_000), None);
        assert_eq!(speech_span([(50.0, 50.0)], 16_000), None);
    }

    #[test]
    fn speech_is_padded_and_clamped_to_the_audio() {
        // 1.0 s – 2.0 s of speech in 5 s of audio, padded by 0.2 s each side.
        assert_eq!(speech_span([(100.0, 200.0)], 80_000), Some(12_800..35_200));
        // Speech running to the very end cannot be padded past it.
        assert_eq!(speech_span([(0.0, 500.0)], 80_000), Some(0..80_000));
    }

    #[test]
    fn separate_phrases_keep_the_pause_between_them() {
        assert_eq!(speech_span([(100.0, 150.0), (300.0, 350.0)], 80_000), Some(12_800..59_200));
    }
}
