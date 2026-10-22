//! What this machine can run, so offline transcription refuses with an explanation
//! instead of crashing.

use std::path::Path;

use serde::Serialize;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CpuSupport {
    pub supported: bool,
    /// Instruction sets the shipped whisper build needs that this processor lacks.
    pub missing: Vec<String>,
}

/// The offline engine is compiled for an AVX2/FMA/F16C floor (see release.yml).
/// Checking it up front is what turns an illegal-instruction crash into a sentence.
pub fn cpu_support() -> CpuSupport {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        let mut missing = Vec::new();
        if !std::is_x86_feature_detected!("avx") {
            missing.push("AVX".to_string());
        }
        if !std::is_x86_feature_detected!("avx2") {
            missing.push("AVX2".to_string());
        }
        if !std::is_x86_feature_detected!("fma") {
            missing.push("FMA".to_string());
        }
        if !std::is_x86_feature_detected!("f16c") {
            missing.push("F16C".to_string());
        }
        CpuSupport {
            supported: missing.is_empty(),
            missing,
        }
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64")))]
    {
        CpuSupport {
            supported: true,
            missing: Vec::new(),
        }
    }
}

pub fn unsupported_cpu_message(missing: &[String]) -> String {
    format!(
        "Offline transcription needs a processor with {} support, which this PC does not have. Use Gemini (online) instead.",
        missing.join(", ")
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemProfile {
    pub cpu_name: String,
    pub physical_cores: usize,
    pub logical_cores: usize,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub cpu: CpuSupport,
}

pub fn system_profile() -> SystemProfile {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let logical = sys.cpus().len().max(1);
    let physical = System::physical_core_count().unwrap_or(logical).max(1);
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Unknown processor".to_string());
    SystemProfile {
        cpu_name,
        physical_cores: physical,
        logical_cores: logical,
        total_memory_mb: sys.total_memory() / 1_048_576,
        available_memory_mb: sys.available_memory() / 1_048_576,
        cpu: cpu_support(),
    }
}

/// Free space on the volume holding `path`; None when it cannot be determined, in which
/// case callers skip the check rather than block a download on a guess.
pub fn free_space_mb(path: &Path) -> Option<u64> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .filter(|disk| path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space() / 1_048_576)
}

/// Model size this PC can comfortably run live. None when offline transcription cannot
/// run at all. "8 GB" machines report a little under 8000 MB, hence the thresholds.
pub fn recommend_tier(cpu_supported: bool, physical_cores: usize, total_memory_mb: u64) -> Option<&'static str> {
    if !cpu_supported {
        return None;
    }
    Some(if physical_cores >= 6 && total_memory_mb >= 7_500 {
        "small"
    } else if physical_cores >= 4 && total_memory_mb >= 3_500 {
        "base"
    } else {
        "tiny"
    })
}

/// Inference threads. On machines with cores to spare, one is left for the projection
/// window: a stuttering output screen is worse than slightly slower captions.
pub fn inference_threads(physical_cores: usize) -> i32 {
    let usable = if physical_cores >= 4 {
        physical_cores - 1
    } else {
        physical_cores
    };
    usable.clamp(1, 8) as i32
}

/// Memory kept free for Windows and the presentation itself.
pub const MEMORY_HEADROOM_MB: u64 = 300;

/// How far short of running a model this PC is right now, if at all.
pub fn memory_shortfall_mb(required_mb: u64, available_mb: u64) -> Option<u64> {
    let needed = required_mb + MEMORY_HEADROOM_MB;
    (available_mb < needed).then(|| needed - available_mb)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_support_is_internally_consistent() {
        let support = cpu_support();
        assert_eq!(support.supported, support.missing.is_empty());
    }

    #[test]
    fn no_recommendation_without_cpu_support() {
        assert_eq!(recommend_tier(false, 16, 32_000), None);
    }

    #[test]
    fn recommends_by_cores_and_memory() {
        assert_eq!(recommend_tier(true, 8, 16_000), Some("small"));
        assert_eq!(recommend_tier(true, 6, 7_800), Some("small"));
        assert_eq!(recommend_tier(true, 4, 7_800), Some("base"));
        assert_eq!(recommend_tier(true, 4, 3_800), Some("base"));
        assert_eq!(recommend_tier(true, 2, 8_000), Some("tiny"));
        assert_eq!(recommend_tier(true, 8, 2_000), Some("tiny"));
    }

    #[test]
    fn leaves_a_core_for_the_ui_when_there_is_one_to_spare() {
        assert_eq!(inference_threads(1), 1);
        assert_eq!(inference_threads(2), 2);
        assert_eq!(inference_threads(4), 3);
        assert_eq!(inference_threads(6), 5);
        assert_eq!(inference_threads(32), 8);
    }

    #[test]
    fn memory_shortfall_includes_headroom() {
        assert_eq!(memory_shortfall_mb(400, 10_000), None);
        assert_eq!(memory_shortfall_mb(400, 700), None);
        assert_eq!(memory_shortfall_mb(400, 699), Some(1));
        assert_eq!(memory_shortfall_mb(900, 500), Some(700));
    }

    #[test]
    fn unsupported_message_names_the_missing_sets() {
        let message = unsupported_cpu_message(&["AVX2".into(), "FMA".into()]);
        assert!(message.contains("AVX2, FMA"));
        assert!(message.contains("Gemini"));
    }
}
