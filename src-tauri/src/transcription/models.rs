use serde::{Deserialize, Serialize};

/// A downloadable whisper.cpp model.
///
/// Sizes are the exact content lengths served by Hugging Face, so a finished download
/// can be checked against them rather than trusted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub url: String,
    pub size_bytes: u64,
    pub note: String,
}

fn model(id: &str, label: &str, size_bytes: u64, note: &str) -> WhisperModelInfo {
    let filename = format!("ggml-{id}.bin");
    WhisperModelInfo {
        id: id.to_string(),
        label: label.to_string(),
        url: format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{filename}"),
        filename,
        size_bytes,
        note: note.to_string(),
    }
}

/// English-only models. Larger ones are more accurate and slower; the medium model is
/// left out deliberately, since 1.4 GB is a poor trade on a machine short of disk.
pub fn catalog() -> Vec<WhisperModelInfo> {
    vec![
        model(
            "tiny.en",
            "Tiny (fastest)",
            77_704_715,
            "Lowest accuracy. Useful to prove the pipeline works.",
        ),
        model(
            "base.en",
            "Base (recommended)",
            147_964_211,
            "The usual starting point: decent accuracy, comfortable speed.",
        ),
        model(
            "small.en",
            "Small (most accurate)",
            487_614_201,
            "Noticeably better on names and references; a little slower per pause.",
        ),
    ]
}

pub fn find(id: &str) -> Option<WhisperModelInfo> {
    catalog().into_iter().find(|m| m.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_model_has_a_matching_filename_and_url() {
        for m in catalog() {
            assert_eq!(m.filename, format!("ggml-{}.bin", m.id));
            assert!(m.url.ends_with(&m.filename), "url should end with filename");
            assert!(m.url.starts_with("https://"), "downloads must be over https");
        }
    }

    #[test]
    fn sizes_are_populated() {
        assert!(catalog().iter().all(|m| m.size_bytes > 1_000_000));
    }

    #[test]
    fn find_resolves_a_known_model_and_rejects_others() {
        assert!(find("base.en").is_some());
        assert!(find("../../etc/passwd").is_none());
        assert!(find("large").is_none());
    }
}
