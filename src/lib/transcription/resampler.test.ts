import { describe, expect, it } from "vitest";
import { StreamingResampler } from "@/lib/transcription/resampler";

function sine(length: number, rate: number, hz = 220, amplitude = 0.5): Float32Array {
  return Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
}

describe("StreamingResampler", () => {
  it("passes audio through untouched when the rates match", () => {
    const input = sine(1000, 16000);
    expect(new StreamingResampler(16000, 16000).process(input)).toEqual(input);
  });

  it("downsamples 48 kHz to a third of the length", () => {
    const out = new StreamingResampler(48000, 16000).process(sine(48000, 48000));
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
  });

  it("handles the awkward 44.1 kHz ratio", () => {
    const out = new StreamingResampler(44100, 16000).process(sine(44100, 44100));
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
  });

  it("upsamples an 8 kHz headset to double the length", () => {
    const out = new StreamingResampler(8000, 16000).process(sine(8000, 8000));
    expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(2);
  });

  it("keeps a constant signal constant", () => {
    const out = new StreamingResampler(48000, 16000).process(new Float32Array(4800).fill(0.25));
    for (const sample of out) expect(sample).toBeCloseTo(0.25, 6);
  });

  it("produces the same total whether fed in one block or many small ones", () => {
    const input = sine(48000, 48000);
    const whole = new StreamingResampler(48000, 16000).process(input).length;

    const chunked = new StreamingResampler(48000, 16000);
    let total = 0;
    for (let i = 0; i < input.length; i += 128) {
      total += chunked.process(input.subarray(i, i + 128)).length;
    }
    expect(Math.abs(total - whole)).toBeLessThanOrEqual(1);
  });

  it("does not drift across a long stream of render quanta", () => {
    const resampler = new StreamingResampler(44100, 16000);
    const quantum = new Float32Array(128);
    const quanta = Math.round((44100 * 60) / 128);
    let total = 0;
    for (let i = 0; i < quanta; i += 1) total += resampler.process(quantum).length;
    // Compare against the input actually fed, not a round 60 s it only approximates.
    const expected = (quanta * 128 * 16000) / 44100;
    expect(Math.abs(total - expected)).toBeLessThanOrEqual(2);
  });

  it("rejects nonsense rates", () => {
    expect(() => new StreamingResampler(0, 16000)).toThrow();
    expect(() => new StreamingResampler(48000, -1)).toThrow();
  });
});
