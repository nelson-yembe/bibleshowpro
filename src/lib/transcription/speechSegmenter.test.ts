import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEGMENTER_CONFIG,
  rmsOf,
  SpeechSegmenter,
} from "@/lib/transcription/speechSegmenter";

const RATE = DEFAULT_SEGMENTER_CONFIG.sampleRate;

function framesForMs(ms: number): number {
  return Math.round((ms / 1000) * RATE);
}

function voiced(ms: number): Float32Array {
  return new Float32Array(framesForMs(ms)).fill(0.4);
}

function silent(ms: number): Float32Array {
  return new Float32Array(framesForMs(ms));
}

describe("rms", () => {
  it("is zero for silence", () => {
    expect(rmsOf(new Float32Array(100))).toBe(0);
  });

  it("is the amplitude for a constant signal", () => {
    expect(rmsOf(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5, 5);
  });

  it("is zero for an empty buffer rather than NaN", () => {
    expect(rmsOf(new Float32Array(0))).toBe(0);
  });
});

describe("SpeechSegmenter", () => {
  it("holds audio while someone is still speaking", () => {
    const segmenter = new SpeechSegmenter();
    expect(segmenter.push(voiced(500))).toBeNull();
    expect(segmenter.push(voiced(500))).toBeNull();
  });

  it("closes a segment after a pause", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(800));
    const segment = segmenter.push(silent(700));
    expect(segment).not.toBeNull();
    expect(segment!.length).toBe(framesForMs(800) + framesForMs(700));
  });

  it("does not close on a pause that follows only a blip", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(100));
    expect(segmenter.push(silent(700))).toBeNull();
  });

  it("forces a segment out when nobody pauses", () => {
    const segmenter = new SpeechSegmenter();
    let segment: Float32Array | null = null;
    for (let i = 0; i < 14 && segment == null; i += 1) {
      segment = segmenter.push(voiced(1000));
    }
    expect(segment).not.toBeNull();
  });

  it("starts clean after emitting a segment", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(800));
    segmenter.push(silent(700));
    expect(segmenter.push(voiced(100))).toBeNull();
  });

  it("flushes buffered speech on demand", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(800));
    const flushed = segmenter.flush();
    expect(flushed).not.toBeNull();
    expect(flushed!.length).toBe(framesForMs(800));
  });

  it("flushes nothing when only silence was buffered", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(silent(2000));
    expect(segmenter.flush()).toBeNull();
  });

  it("ignores empty pushes", () => {
    const segmenter = new SpeechSegmenter();
    expect(segmenter.push(new Float32Array(0))).toBeNull();
  });
});
