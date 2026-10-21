/**
 * Wire format for the Gemini Live API transcription socket.
 *
 * Kept free of browser APIs so the framing and parsing can be unit tested without
 * opening a socket or a microphone.
 */

export const GEMINI_LIVE_HOST =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

/** Purpose-built transcription model; overridable from settings when Google moves it. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-transcribe-live";

/** The service wants raw 16-bit PCM, mono, little-endian, at this rate. */
export const GEMINI_SAMPLE_RATE = 16000;
/** ~100ms per chunk, which is what the Live API guide asks for. */
export const GEMINI_CHUNK_FRAMES = 1600;

export function buildLiveUrl(apiKey: string): string {
  return `${GEMINI_LIVE_HOST}?key=${encodeURIComponent(apiKey)}`;
}

export function buildSetupMessage(model: string, languageCodes: string[] = []): string {
  return JSON.stringify({
    setup: {
      model: model.startsWith("models/") ? model : `models/${model}`,
      inputAudioTranscription: { languageCodes },
    },
  });
}

export function buildAudioMessage(base64Pcm: string, sampleRate = GEMINI_SAMPLE_RATE): string {
  return JSON.stringify({
    realtimeInput: {
      audio: { data: base64Pcm, mimeType: `audio/pcm;rate=${sampleRate}` },
    },
  });
}

export type GeminiServerEvent =
  | { kind: "setupComplete" }
  | { kind: "partial"; text: string }
  | { kind: "final"; text: string }
  | { kind: "error"; message: string }
  | { kind: "ignored" };

interface ServerFrame {
  setupComplete?: unknown;
  serverContent?: {
    interimInputTranscription?: { text?: unknown };
    inputTranscription?: { text?: unknown };
  };
  error?: { message?: unknown; status?: unknown };
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Classify one server frame.
 *
 * Anything unrecognised is reported as `ignored` rather than guessed at — a wrong guess
 * here would put invented words on the projector.
 */
export function parseServerMessage(raw: string): GeminiServerEvent {
  let frame: ServerFrame;
  try {
    frame = JSON.parse(raw) as ServerFrame;
  } catch {
    return { kind: "error", message: "Unreadable response from Gemini." };
  }

  if (frame.error) {
    const message = textOf(frame.error.message) ?? textOf(frame.error.status) ?? "Gemini reported an error.";
    return { kind: "error", message };
  }

  if (frame.setupComplete !== undefined) return { kind: "setupComplete" };

  const interim = textOf(frame.serverContent?.interimInputTranscription?.text);
  if (interim) return { kind: "partial", text: interim };

  const settled = textOf(frame.serverContent?.inputTranscription?.text);
  if (settled) return { kind: "final", text: settled };

  return { kind: "ignored" };
}

export { encodeBase64, floatTo16BitPcm } from "@/lib/transcription/pcm";
