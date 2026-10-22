import { describe, expect, it } from "vitest";
import {
  appendBacklog,
  DEFAULT_SEGMENTER_CONFIG,
  MAX_BACKLOG_SECONDS,
  rmsOf,
  SpeechSegmenter,
} from "@/lib/transcription/speechSegmenter";

const RATE = DEFAULT_SEGMENTER_CONFIG.sampleRate;

function framesForMs(ms: number): number {
  return Math.round((ms / 1000) * RATE);
}

function tone(ms: number, level: number): Float32Array {
  return new Float32Array(framesForMs(ms)).fill(level);
}

const voiced = (ms: number) => tone(ms, 0.4);
const silent = (ms: number) => new Float32Array(framesForMs(ms));

/** Feed in render-quantum-sized pieces, the way the microphone actually delivers. */
function pushInPieces(segmenter: SpeechSegmenter, audio: Float32Array, piece = 128) {
  const out: Float32Array[] = [];
  for (let i = 0; i < audio.length; i += piece) {
    const segment = segmenter.push(audio.subarray(i, i + piece));
    if (segment) out.push(segment);
  }
  return out;
}

describe("rms", () => {
  it("is zero for silence and for an empty buffer", () => {
    expect(rmsOf(new Float32Array(100))).toBe(0);
    expect(rmsOf(new Float32Array(0))).toBe(0);
  });

  it("is the amplitude for a constant signal", () => {
    expect(rmsOf(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5, 5);
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
    const segment = segmenter.push(silent(800));
    expect(segment).not.toBeNull();
    expect(segment!.length).toBe(framesForMs(800) + framesForMs(800));
  });

  it("drops a blip followed by a pause instead of sending it", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(100));
    expect(segmenter.push(silent(800))).toBeNull();
    expect(segmenter.flush()).toBeNull();
  });

  it("forces a segment out when nobody pauses", () => {
    const segmenter = new SpeechSegmenter();
    let segment: Float32Array | null = null;
    for (let i = 0; i < 14 && segment == null; i += 1) segment = segmenter.push(voiced(1000));
    expect(segment).not.toBeNull();
  });

  it("never sends silence, however long it runs", () => {
    const segmenter = new SpeechSegmenter();
    const out = pushInPieces(segmenter, silent(30_000));
    expect(out).toHaveLength(0);
    expect(segmenter.flush()).toBeNull();
  });

  it("keeps only a short pre-roll of silence ahead of speech", () => {
    const segmenter = new SpeechSegmenter();
    pushInPieces(segmenter, silent(5_000));
    pushInPieces(segmenter, voiced(1_000));
    const segment = segmenter.flush()!;
    const silenceKept = segment.length - framesForMs(1_000);
    expect(silenceKept).toBeLessThanOrEqual(framesForMs(DEFAULT_SEGMENTER_CONFIG.preRollMs) + 128);
    expect(silenceKept).toBeGreaterThan(0);
  });

  it("hears speech from a quiet microphone that a fixed threshold would miss", () => {
    const segmenter = new SpeechSegmenter();
    pushInPieces(segmenter, tone(2_000, 0.002)); // a quiet room
    const out = [
      ...pushInPieces(segmenter, tone(1_500, 0.01)), // soft speech, below the old 0.012 bar
      ...pushInPieces(segmenter, tone(1_000, 0.002)),
    ];
    expect(out).toHaveLength(1);
  });

  it("does not mistake a noisy hall for speech", () => {
    const segmenter = new SpeechSegmenter();
    const out = pushInPieces(segmenter, tone(20_000, 0.03));
    expect(out).toHaveLength(0);
  });

  it("still hears a speaker over a noisy hall", () => {
    const segmenter = new SpeechSegmenter();
    pushInPieces(segmenter, tone(3_000, 0.03));
    const out = [
      ...pushInPieces(segmenter, tone(1_500, 0.2)),
      ...pushInPieces(segmenter, tone(1_000, 0.03)),
    ];
    expect(out).toHaveLength(1);
  });

  it("starts clean after emitting a segment", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(800));
    segmenter.push(silent(800));
    expect(segmenter.push(voiced(100))).toBeNull();
  });

  it("flushes buffered speech on demand", () => {
    const segmenter = new SpeechSegmenter();
    segmenter.push(voiced(800));
    expect(segmenter.flush()!.length).toBe(framesForMs(800));
  });

  it("ignores empty pushes", () => {
    expect(new SpeechSegmenter().push(new Float32Array(0))).toBeNull();
  });
});

describe("appendBacklog", () => {
  it("joins a segment onto the backlog in order", () => {
    const joined = appendBacklog(Float32Array.from([1, 2]), Float32Array.from([3]));
    expect(Array.from(joined)).toEqual([1, 2, 3]);
  });

  it("starts a backlog from nothing", () => {
    expect(Array.from(appendBacklog(null, Float32Array.from([7])))).toEqual([7]);
  });

  it("keeps the newest audio once past the cap", () => {
    const limit = MAX_BACKLOG_SECONDS * RATE;
    const old = new Float32Array(limit).fill(1);
    const fresh = new Float32Array(RATE).fill(2);
    const joined = appendBacklog(old, fresh);
    expect(joined.length).toBe(limit);
    expect(joined[joined.length - 1]).toBe(2);
    expect(joined[0]).toBe(1);
  });
});
