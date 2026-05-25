use serde::{Deserialize, Serialize};

pub const SETTINGS_KEY: &str = "output.ndi";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiOutputConfig {
    pub enabled: bool,
    pub program_source_name: String,
    pub preview_source_name: String,
    pub enable_preview_output: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub fps_denominator: u32,
    pub pixel_format: String,
    pub groups: Vec<String>,
    pub enable_audio: bool,
    pub enable_metadata: bool,
    pub enable_tally: bool,
    pub enable_ptz: bool,
    pub enable_bandwidth_adaptation: bool,
    pub capture_mode: String,
    pub auto_start_on_launch: bool,
    pub auto_start_on_go_live: bool,
    pub auto_open_output_when_starting: bool,
    pub show_test_pattern_when_idle: bool,
    pub port: u16,
    pub max_connections: usize,
    pub metadata_interval_ms: u64,
}

impl Default for NdiOutputConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            program_source_name: "Bible Show Pro — Program".to_string(),
            preview_source_name: "Bible Show Pro — Preview".to_string(),
            enable_preview_output: false,
            width: 1920,
            height: 1080,
            fps: 30,
            fps_denominator: 1,
            pixel_format: "bgra".to_string(),
            groups: vec!["Bible Show Pro".to_string()],
            enable_audio: false,
            enable_metadata: true,
            enable_tally: true,
            enable_ptz: false,
            enable_bandwidth_adaptation: true,
            capture_mode: "output_window".to_string(),
            auto_start_on_launch: false,
            auto_start_on_go_live: true,
            auto_open_output_when_starting: true,
            show_test_pattern_when_idle: false,
            port: 0,
            max_connections: 64,
            metadata_interval_ms: 1000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NdiFeedStatus {
    pub active: bool,
    pub source_name: String,
    pub address: Option<String>,
    pub connections: usize,
    pub frames_sent: u64,
    pub video_frames: u64,
    pub audio_frames: u64,
    pub bitrate: u64,
    pub measured_fps: f64,
    pub tally_program: bool,
    pub tally_preview: bool,
    pub width: u32,
    pub height: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NdiRuntimeStatus {
    pub running: bool,
    pub error: Option<String>,
    pub program: NdiFeedStatus,
    pub preview: NdiFeedStatus,
    pub capture_mode: String,
    pub uptime_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiDiscoveredSource {
    pub id: String,
    pub name: String,
    pub address: String,
    pub groups: Vec<String>,
    pub has_audio: bool,
    pub has_video: bool,
    pub has_metadata: bool,
}

impl NdiOutputConfig {
    pub fn frame_interval_ms(&self) -> u64 {
        if self.fps == 0 {
            return 33;
        }
        ((self.fps_denominator as u64) * 1000) / self.fps as u64
    }

    pub fn video_format(&self) -> oximedia_ndi::VideoFormat {
        oximedia_ndi::VideoFormat::new(self.width, self.height, self.fps, self.fps_denominator)
    }
}
