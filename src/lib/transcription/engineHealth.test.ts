import { describe, expect, it } from "vitest";
import {
  AUDIO_PRESENT_RMS,
  diagnoseListening,
  faultMessage,
} from "@/lib/transcription/engineHealth";

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

  it("treats a whisper below the threshold as no audio", () => {
    expect(
      diagnoseListening({ hasTranscript: false, peakAudioLevel: AUDIO_PRESENT_RMS - 0.001 }),
    ).toBe("no-audio");
  });
});

describe("faultMessage", () => {
  it("points at Windows input for a dead microphone", () => {
    expect(faultMessage("no-audio", "Web Speech")).toMatch(/Windows Sound/);
  });

  it("names the engine and offers the working alternatives", () => {
    const message = faultMessage("engine-silent", "Web Speech (Browser)") ?? "";
    expect(message).toContain("Web Speech (Browser)");
    expect(message).toMatch(/Whisper/);
    expect(message).toMatch(/Gemini/);
  });

  it("says nothing when there is no fault", () => {
    expect(faultMessage(null, "Web Speech")).toBeNull();
  });
});
