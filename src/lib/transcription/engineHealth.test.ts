import { describe, expect, it } from "vitest";
import {
  AUDIO_PRESENT_RMS,
  CHUNKED_SILENCE_MS,
  diagnoseListening,
  faultMessage,
  silenceWindowMs,
  STREAMING_SILENCE_MS,
} from "@/lib/transcription/engineHealth";
import { ENGINE_GEMINI, ENGINE_WEB_SPEECH, ENGINE_WHISPER } from "@/lib/transcription/engine";

describe("diagnoseListening", () => {
  it("reports nothing once any transcript has arrived", () => {
    expect(diagnoseListening({ hasTranscript: true, peakAudioLevel: 0 })).toBeNull();
    expect(diagnoseListening({ hasTranscript: true, peakAudioLevel: 0.9 })).toBeNull();
  });

  it("blames the microphone when no audio ever reached the engine", () => {
    expect(diagnoseListening({ hasTranscript: false, peakAudioLevel: 0 })).toBe("no-audio");
  });

  it("blames the engine when audio is arriving but nothing comes back", () => {
    expect(diagnoseListening({ hasTranscript: false, peakAudioLevel: 0.5 })).toBe("engine-silent");
  });

  it("treats the threshold itself as audio present", () => {
    expect(diagnoseListening({ hasTranscript: false, peakAudioLevel: AUDIO_PRESENT_RMS })).toBe(
      "engine-silent",
    );
  });
});

describe("silenceWindowMs", () => {
  it("gives a streaming engine a short window", () => {
    expect(silenceWindowMs(true)).toBe(STREAMING_SILENCE_MS);
  });

  it("gives a chunked engine long enough to close a segment and run inference", () => {
    expect(silenceWindowMs(false)).toBe(CHUNKED_SILENCE_MS);
  });

  it("allows a chunked engine more than its worst-case segment length", () => {
    // The segmenter forces a segment out at 12s; model load and inference follow.
    expect(CHUNKED_SILENCE_MS).toBeGreaterThan(12_000 * 2);
  });
});

describe("faultMessage", () => {
  const whisper = { id: ENGINE_WHISPER, label: "Whisper (offline)" };
  const gemini = { id: ENGINE_GEMINI, label: "Gemini Transcribe Live" };
  const webSpeech = { id: ENGINE_WEB_SPEECH, label: "Web Speech (Browser)" };

  it("points at Windows input for a dead microphone", () => {
    expect(faultMessage("no-audio", webSpeech)).toMatch(/Windows Sound/);
  });

  it("offers the working alternatives when browser recognition goes quiet", () => {
    const message = faultMessage("engine-silent", webSpeech) ?? "";
    expect(message).toContain("Web Speech (Browser)");
    expect(message).toMatch(/Whisper/);
    expect(message).toMatch(/Gemini/);
  });

  it("never tells a Whisper operator to switch to Whisper", () => {
    const message = faultMessage("engine-silent", whisper) ?? "";
    expect(message).toContain("Whisper (offline)");
    expect(message).not.toMatch(/switch to Whisper/i);
    expect(message).toMatch(/input level|microphone is selected/i);
  });

  it("points Gemini at its key and connection, not at other engines", () => {
    const message = faultMessage("engine-silent", gemini) ?? "";
    expect(message).toMatch(/API key/);
    expect(message).not.toMatch(/switch to/i);
  });

  it("says nothing when there is no fault", () => {
    expect(faultMessage(null, webSpeech)).toBeNull();
  });
});
