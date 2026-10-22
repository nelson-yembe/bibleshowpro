/**
 * Telling apart "the microphone is dead" from "the engine is dead".
 *
 * These look identical on screen — the status says listening and nothing appears — but
 * they need opposite remedies, and the remedy also differs per engine.
 */

import { ENGINE_GEMINI, ENGINE_WHISPER } from "@/lib/transcription/engine";

/** Peak RMS above which we consider real audio to have reached the engine. */
export const AUDIO_PRESENT_RMS = 0.02;

/** A streaming engine should produce interim text within seconds. */
export const STREAMING_SILENCE_MS = 12_000;
/**
 * A chunked engine cannot produce anything until a segment closes and inference
 * finishes. Whisper closes at 12s in the worst case, then loads the model on first use
 * and runs inference — so the streaming window would fire on a perfectly healthy run.
 */
export const CHUNKED_SILENCE_MS = 45_000;

export type ListeningFault =
  /** Nothing is reaching the engine: wrong input device, muted, unplugged. */
  | "no-audio"
  /** Audio is arriving but the engine has returned nothing at all. */
  | "engine-silent"
  | null;

export function silenceWindowMs(streaming: boolean): number {
  return streaming ? STREAMING_SILENCE_MS : CHUNKED_SILENCE_MS;
}

export function diagnoseListening(args: {
  hasTranscript: boolean;
  peakAudioLevel: number;
}): ListeningFault {
  if (args.hasTranscript) return null;
  return args.peakAudioLevel >= AUDIO_PRESENT_RMS ? "engine-silent" : "no-audio";
}

/** What to try next, which depends on which engine went quiet. */
function silentEngineRemedy(engineId: string): string {
  if (engineId === ENGINE_WHISPER) {
    // Music and noise are filtered out before Whisper, so this also appears during a long
    // instrumental — and clears by itself once someone speaks.
    return "It has not heard any speech yet. If someone is speaking, check the input level and that the right microphone is selected.";
  }
  if (engineId === ENGINE_GEMINI) {
    return "Check the API key and that this machine can reach the internet.";
  }
  return "Browser speech recognition is often unavailable inside the installed app — switch to Whisper (offline) or Gemini in Settings → Transcription Engine.";
}

export function faultMessage(
  fault: ListeningFault,
  engine: { id: string; label: string },
): string | null {
  switch (fault) {
    case "no-audio":
      return "Still no audio on the selected input — verify Windows Sound → Input, speak into the mic, or set this device as the default recording device.";
    case "engine-silent":
      return `${engine.label} is receiving audio but has returned no text. ${silentEngineRemedy(engine.id)}`;
    case null:
      return null;
  }
}
