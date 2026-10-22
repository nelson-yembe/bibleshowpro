use serde::{Deserialize, Serialize};

/// A downloadable whisper.cpp model.
///
/// Sizes and SHA-256 hashes are the values Hugging Face serves for these files, so a
/// download is checked against them rather than trusted. Memory figures are whisper.cpp's
/// own published requirements.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelInfo {
    pub id: String,
    /// "tiny" | "base" | "small" — what the PC recommendation picks between.
    pub tier: String,
    pub label: String,
    pub filename: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub ram_mb: u64,
    /// English-only models are more accurate for English; the others also handle French.
    pub english_only: bool,
    pub note: String,
}

#[allow(clippy::too_many_arguments)]
fn model(
    id: &str,
    tier: &str,
    label: &str,
    size_bytes: u64,
    sha256: &str,
    ram_mb: u64,
    note: &str,
) -> WhisperModelInfo {
    let filename = format!("ggml-{id}.bin");
    WhisperModelInfo {
        id: id.to_string(),
        tier: tier.to_string(),
        label: label.to_string(),
        url: format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{filename}"),
        filename,
        size_bytes,
        sha256: sha256.to_string(),
        ram_mb,
        english_only: id.ends_with(".en"),
        note: note.to_string(),
    }
}

/// Medium and large are left out on purpose: at 1.5 GB and up they are a poor trade on
/// the machines this runs on, and the file picker still accepts any model.
pub fn catalog() -> Vec<WhisperModelInfo> {
    vec![
        model(
            "tiny.en",
            "tiny",
            "Tiny",
            77_704_715,
            "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
            273,
            "Fastest. For older or low-power PCs.",
        ),
        model(
            "base.en",
            "base",
            "Base",
            147_964_211,
            "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
            388,
            "Good balance of speed and accuracy for most PCs.",
        ),
        model(
            "small.en",
            "small",
            "Small",
            487_614_201,
            "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
            852,
            "Most accurate. Needs a fast PC with plenty of memory.",
        ),
        model(
            "tiny",
            "tiny",
            "Tiny",
            77_691_713,
            "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
            273,
            "Fastest. For older or low-power PCs.",
        ),
        model(
            "base",
            "base",
            "Base",
            147_951_465,
            "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
            388,
            "Good balance of speed and accuracy for most PCs.",
        ),
        model(
            "small",
            "small",
            "Small",
            487_601_967,
            "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
            852,
            "Most accurate. Needs a fast PC with plenty of memory.",
        ),
    ]
}

pub fn find(id: &str) -> Option<WhisperModelInfo> {
    catalog().into_iter().find(|m| m.id == id)
}

/// The catalog entry for a tier in the requested language family.
pub fn for_tier(tier: &str, english_only: bool) -> Option<WhisperModelInfo> {
    catalog()
        .into_iter()
        .find(|m| m.tier == tier && m.english_only == english_only)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn every_model_has_a_matching_filename_and_https_url() {
        for m in catalog() {
            assert_eq!(m.filename, format!("ggml-{}.bin", m.id));
            assert!(m.url.ends_with(&m.filename));
            assert!(m.url.starts_with("https://"));
        }
    }

    #[test]
    fn hashes_are_full_sha256_hex() {
        for m in catalog() {
            assert_eq!(m.sha256.len(), 64, "{} hash length", m.id);
            assert!(m.sha256.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[test]
    fn ids_are_unique_and_english_flag_matches_suffix() {
        let mut seen = HashSet::new();
        for m in catalog() {
            assert!(seen.insert(m.id.clone()), "duplicate id {}", m.id);
            assert_eq!(m.english_only, m.id.ends_with(".en"));
        }
    }

    #[test]
    fn each_tier_exists_in_both_language_families() {
        for tier in ["tiny", "base", "small"] {
            assert!(for_tier(tier, true).is_some(), "english {tier}");
            assert!(for_tier(tier, false).is_some(), "multilingual {tier}");
        }
    }

    #[test]
    fn find_rejects_anything_not_in_the_catalog() {
        assert!(find("base.en").is_some());
        assert!(find("../../etc/passwd").is_none());
        assert!(find("large").is_none());
    }
}
