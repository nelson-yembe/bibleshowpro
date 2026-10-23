import {
  ENGINE_GEMINI,
  ENGINE_WHISPER,
  type TranscriptionEngine,
} from "@/lib/transcription/engine";
import { GeminiTranscriptionEngine } from "@/lib/transcription/geminiProvider";
import { WhisperTranscriptionEngine } from "@/lib/transcription/whisperProvider";

/**
 * Build the engine the operator picked.
 *
 * Unknown ids fall back to Whisper rather than failing, so a stale persisted preference
 * cannot leave a service with no transcription at all.
 */
export function createTranscriptionEngine(modelId: string): TranscriptionEngine {
  switch (modelId) {
    case ENGINE_GEMINI:
      return new GeminiTranscriptionEngine();
    case ENGINE_WHISPER:
    default:
      return new WhisperTranscriptionEngine();
  }
}
