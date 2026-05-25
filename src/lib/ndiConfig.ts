export interface NdiOutputConfig {
  enabled: boolean;
  programSourceName: string;
  previewSourceName: string;
  enablePreviewOutput: boolean;
  width: number;
  height: number;
  fps: number;
  fpsDenominator: number;
  pixelFormat: "bgra" | "uyvy";
  groups: string[];
  enableAudio: boolean;
  enableMetadata: boolean;
  enableTally: boolean;
  enablePtz: boolean;
  enableBandwidthAdaptation: boolean;
  captureMode: "output_window" | "ipc_frames";
  autoStartOnLaunch: boolean;
  autoStartOnGoLive: boolean;
  autoOpenOutputWhenStarting: boolean;
  showTestPatternWhenIdle: boolean;
  port: number;
  maxConnections: number;
  metadataIntervalMs: number;
}

export interface NdiFeedStatus {
  active: boolean;
  sourceName: string;
  address?: string | null;
  connections: number;
  framesSent: number;
  videoFrames: number;
  audioFrames: number;
  bitrate: number;
  measuredFps: number;
  tallyProgram: boolean;
  tallyPreview: boolean;
  width: number;
  height: number;
  lastError?: string | null;
}

export interface NdiRuntimeStatus {
  running: boolean;
  error?: string | null;
  program: NdiFeedStatus;
  preview: NdiFeedStatus;
  captureMode: string;
  uptimeMs: number;
}

export interface NdiDiscoveredSource {
  id: string;
  name: string;
  address: string;
  groups: string[];
  hasAudio: boolean;
  hasVideo: boolean;
  hasMetadata: boolean;
}

export const NDI_RESOLUTION_PRESETS = [
  { id: "1080p", label: "1920 × 1080 (1080p)", width: 1920, height: 1080 },
  { id: "720p", label: "1280 × 720 (720p)", width: 1280, height: 720 },
  { id: "4k", label: "3840 × 2160 (4K UHD)", width: 3840, height: 2160 },
  { id: "custom", label: "Custom", width: 0, height: 0 },
] as const;

export const NDI_FPS_PRESETS = [
  { id: "30", label: "30 fps", fps: 30, fpsDenominator: 1 },
  { id: "29.97", label: "29.97 fps (NTSC)", fps: 30000, fpsDenominator: 1001 },
  { id: "60", label: "60 fps", fps: 60, fpsDenominator: 1 },
  { id: "59.94", label: "59.94 fps", fps: 60000, fpsDenominator: 1001 },
] as const;

export function defaultNdiConfig(): NdiOutputConfig {
  return {
    enabled: false,
    programSourceName: "Bible Show Pro — Program",
    previewSourceName: "Bible Show Pro — Preview",
    enablePreviewOutput: false,
    width: 1920,
    height: 1080,
    fps: 30,
    fpsDenominator: 1,
    pixelFormat: "bgra",
    groups: ["Bible Show Pro"],
    enableAudio: false,
    enableMetadata: true,
    enableTally: true,
    enablePtz: false,
    enableBandwidthAdaptation: true,
    captureMode: "output_window",
    autoStartOnLaunch: false,
    autoStartOnGoLive: true,
    autoOpenOutputWhenStarting: true,
    showTestPatternWhenIdle: false,
    port: 0,
    maxConnections: 64,
    metadataIntervalMs: 1000,
  };
}

export function formatNdiFps(config: Pick<NdiOutputConfig, "fps" | "fpsDenominator">): string {
  if (config.fpsDenominator === 1) return `${config.fps} fps`;
  return `${(config.fps / config.fpsDenominator).toFixed(2)} fps`;
}

export function formatBitrate(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}
