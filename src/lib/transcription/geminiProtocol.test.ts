import { describe, expect, it } from "vitest";
import {
  buildAudioMessage,
  buildLiveUrl,
  buildSetupMessage,
  encodeBase64,
  floatTo16BitPcm,
  GEMINI_SAMPLE_RATE,
  parseServerMessage,
} from "@/lib/transcription/geminiProtocol";

describe("gemini live url", () => {
  it("escapes the api key", () => {
    expect(buildLiveUrl("a b+c/d")).toContain("key=a%20b%2Bc%2Fd");
  });
});

describe("setup message", () => {
  it("qualifies a bare model id and enables input transcription", () => {
    const setup = JSON.parse(buildSetupMessage("gemini-3.5-transcribe-live"));
    expect(setup.setup.model).toBe("models/gemini-3.5-transcribe-live");
    expect(setup.setup.inputAudioTranscription).toEqual({ languageCodes: [] });
  });

  it("does not double-prefix an already qualified model id", () => {
    const setup = JSON.parse(buildSetupMessage("models/gemini-3.5-transcribe-live"));
    expect(setup.setup.model).toBe("models/gemini-3.5-transcribe-live");
  });

  it("passes language hints through", () => {
    const setup = JSON.parse(buildSetupMessage("m", ["en-GB"]));
    expect(setup.setup.inputAudioTranscription.languageCodes).toEqual(["en-GB"]);
  });
});

describe("audio message", () => {
  it("declares the pcm mime type at the sample rate", () => {
    const msg = JSON.parse(buildAudioMessage("QUJD"));
    expect(msg.realtimeInput.audio.mimeType).toBe(`audio/pcm;rate=${GEMINI_SAMPLE_RATE}`);
    expect(msg.realtimeInput.audio.data).toBe("QUJD");
  });
});

describe("parsing server frames", () => {
  it("recognises setup completion", () => {
    expect(parseServerMessage(JSON.stringify({ setupComplete: {} }))).toEqual({
      kind: "setupComplete",
    });
  });

  it("reads an interim hypothesis as a partial", () => {
    const frame = { serverContent: { interimInputTranscription: { text: "the Lord is" } } };
    expect(parseServerMessage(JSON.stringify(frame))).toEqual({
      kind: "partial",
      text: "the Lord is",
    });
  });

  it("reads a settled turn as a final", () => {
    const frame = { serverContent: { inputTranscription: { text: "the Lord is my shepherd" } } };
    expect(parseServerMessage(JSON.stringify(frame))).toEqual({
      kind: "final",
      text: "the Lord is my shepherd",
    });
  });

  it("prefers the interim hypothesis when both are present", () => {
    const frame = {
      serverContent: {
        interimInputTranscription: { text: "partial" },
        inputTranscription: { text: "settled" },
      },
    };
    expect(parseServerMessage(JSON.stringify(frame))).toEqual({ kind: "partial", text: "partial" });
  });

  it("surfaces a service error", () => {
    const frame = { error: { message: "quota exceeded" } };
    expect(parseServerMessage(JSON.stringify(frame))).toEqual({
      kind: "error",
      message: "quota exceeded",
    });
  });

  it("reports unreadable json rather than throwing", () => {
    expect(parseServerMessage("{not json")).toMatchObject({ kind: "error" });
  });

  it("ignores frames it does not recognise instead of guessing", () => {
    expect(parseServerMessage(JSON.stringify({ somethingElse: true }))).toEqual({ kind: "ignored" });
  });

  it("ignores an empty transcript rather than emitting blank text", () => {
    const frame = { serverContent: { inputTranscription: { text: "" } } };
    expect(parseServerMessage(JSON.stringify(frame))).toEqual({ kind: "ignored" });
  });
});

describe("pcm conversion", () => {
  it("writes little-endian signed 16-bit samples", () => {
    const bytes = new Uint8Array(floatTo16BitPcm(Float32Array.from([1, -1, 0])));
    expect(Array.from(bytes)).toEqual([0xff, 0x7f, 0x00, 0x80, 0x00, 0x00]);
  });

  it("clamps samples beyond the valid range", () => {
    const bytes = new Uint8Array(floatTo16BitPcm(Float32Array.from([4, -4])));
    expect(Array.from(bytes)).toEqual([0xff, 0x7f, 0x00, 0x80]);
  });
});

describe("base64", () => {
  it("encodes raw bytes", () => {
    expect(encodeBase64(Uint8Array.from([65, 66, 67]).buffer)).toBe("QUJD");
  });
});
