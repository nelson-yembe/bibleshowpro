/** Shared contract every transcription engine implements. */

export type TranscriptionStatus =
  | "listening"
  /** Audio captured, engine working on it — the only sign of life a chunked engine gives. */
  | "processing"
  | "paused"
  | "stopped"
  | "unavailable"
  | "reconnecting";

export interface TranscriptionCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (status: TranscriptionStatus) => void;
  onError: (message: string) => void;
  onAudioActivity?: (level: number) => void;
}

/** Engine-specific settings, resolved by the caller before start. */
export interface TranscriptionEngineConfig {
  geminiApiKey?: string;
  geminiModel?: string;
  whisperModelPath?: string;
  /** Empty list asks the service to auto-detect. */
  languageCodes?: string[];
}

export interface TranscriptionEngineOptions {
  modelId: string;
  language?: string;
  config?: TranscriptionEngineConfig;
}

/**
 * Swappable speech-to-text backend.
 *
 * `start` opens the microphone and streams until `stop`. `pause` must stop emitting
 * without tearing down the session, so `resume` can pick up cheaply.
 */
export interface TranscriptionEngine {
  /** False when this machine or build cannot run the engine at all. */
  isSupported(): boolean;
  start(
    callbacks: TranscriptionCallbacks,
    options: TranscriptionEngineOptions,
    deviceId?: string | null,
  ): Promise<void> | void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export const ENGINE_WEB_SPEECH = "web-speech";
/** Kept under the old id so persisted operator preferences survive the rename. */
export const ENGINE_WEB_SPEECH_BALANCED = "web-speech-offline";
export const ENGINE_GEMINI = "gemini-transcribe-live";
export const ENGINE_WHISPER = "whisper-local";
