/**
 * Telling apart "the microphone is dead" from "the engine is dead".
 *
 * These look identical on screen — the status says listening and nothing appears — but
 * they need opposite remedies, and the old watchdog only ever reported the first.
 */

/** Peak RMS above which we consider real audio to have reached the engine. */
export const AUDIO_PRESENT_RMS = 0.02;

export type ListeningFault =
  /** Nothing is reaching the engine: wrong input device, muted, unplugged. */
  | "no-audio"
  /** Audio is arriving but the engine has returned nothing at all. */
  | "engine-silent"
  | null;

export function diagnoseListening(args: {
  hasTranscript: boolean;
  peakAudioLevel: number;
}): ListeningFault {
  if (args.hasTranscript) return null;
  return args.peakAudioLevel >= AUDIO_PRESENT_RMS ? "engine-silent" : "no-audio";
}

export function faultMessage(fault: ListeningFault, engineLabel: string): string | null {
  switch (fault) {
    case "no-audio":
      return "Still no audio on the selected input — verify Windows Sound → Input, speak into the mic, or set this device as the default recording device.";
    case "engine-silent":
      return `${engineLabel} is receiving audio but has returned no text. Browser speech recognition is often unavailable inside the installed app — switch to Whisper (offline) or Gemini in Settings → Transcription Engine.`;
    case null:
      return null;
  }
}
