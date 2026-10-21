import { describe, expect, it } from "vitest";
import {
  createVoiceNavGuard,
  recordVerseNavAccepted,
  rearmVoiceNav,
  resetVoiceNavGuard,
  shouldAcceptVerseNav,
  VOICE_NAV_COOLDOWN_MS,
} from "@/lib/transcription/voiceNavGuard";

describe("voice navigation guard", () => {
  it("accepts the first spoken cue", () => {
    const guard = createVoiceNavGuard();
    expect(shouldAcceptVerseNav(guard, "next_verse", 1000)).toBe(true);
  });

  it("blocks repeated deliveries of a single cue", () => {
    const guard = createVoiceNavGuard();
    let steps = 0;
    for (const now of [1000, 1050, 1120, 1300, 2400]) {
      if (shouldAcceptVerseNav(guard, "next_verse", now)) {
        steps += 1;
        recordVerseNavAccepted(guard, "next_verse", now);
      }
    }
    expect(steps).toBe(1);
  });

  it("accepts the same wording again once the cooldown has elapsed", () => {
    const guard = createVoiceNavGuard();
    recordVerseNavAccepted(guard, "next_verse", 1000);
    const later = 1000 + VOICE_NAV_COOLDOWN_MS + 100;
    expect(shouldAcceptVerseNav(guard, "next_verse", later)).toBe(true);
  });

  it("steps once per cue across a run of identical cues", () => {
    const guard = createVoiceNavGuard();
    let steps = 0;
    for (let i = 0; i < 5; i += 1) {
      const now = 1000 + i * (VOICE_NAV_COOLDOWN_MS + 500);
      if (shouldAcceptVerseNav(guard, "next_verse", now)) {
        steps += 1;
        recordVerseNavAccepted(guard, "next_verse", now);
      }
    }
    expect(steps).toBe(5);
  });

  it("never wedges navigation when no timer re-arms it", () => {
    const guard = createVoiceNavGuard();
    recordVerseNavAccepted(guard, "next_verse", 1000);
    expect(shouldAcceptVerseNav(guard, "next_verse", 60_000)).toBe(true);
  });

  it("allows an immediate direction change", () => {
    const guard = createVoiceNavGuard();
    recordVerseNavAccepted(guard, "next_verse", 1000);
    expect(shouldAcceptVerseNav(guard, "prev_verse", 1200)).toBe(true);
  });

  it("re-arms after ordinary speech", () => {
    const guard = createVoiceNavGuard();
    recordVerseNavAccepted(guard, "next_verse", 1000);
    rearmVoiceNav(guard);
    expect(shouldAcceptVerseNav(guard, "next_verse", 1100)).toBe(true);
  });

  it("resets fully for a new listening session", () => {
    const guard = createVoiceNavGuard();
    recordVerseNavAccepted(guard, "next_verse", 1000);
    resetVoiceNavGuard(guard);
    expect(shouldAcceptVerseNav(guard, "next_verse", 1010)).toBe(true);
  });
});
