export type VerseNavType = "next_verse" | "prev_verse";

/** One spoken cue must move exactly one verse, never a run of them. */
export const VOICE_NAV_COOLDOWN_MS = 2500;

export interface VoiceNavGuard {
  lastAt: number;
  lastType: VerseNavType | null;
}

export function createVoiceNavGuard(): VoiceNavGuard {
  return { lastAt: 0, lastType: null };
}

/**
 * Speech recognition delivers the same cue more than once, so a step is only
 * accepted after the cooldown has elapsed. The window is time-based rather than
 * a latch cleared by a timer, so a dropped timer can never wedge navigation.
 */
export function shouldAcceptVerseNav(
  guard: VoiceNavGuard,
  type: VerseNavType,
  now: number,
  cooldownMs: number = VOICE_NAV_COOLDOWN_MS,
): boolean {
  // Reversing direction cannot be an echo of the previous cue, so it always passes.
  if (guard.lastType !== type) return true;
  return now - guard.lastAt >= cooldownMs;
}

export function recordVerseNavAccepted(
  guard: VoiceNavGuard,
  type: VerseNavType,
  now: number,
): void {
  guard.lastAt = now;
  guard.lastType = type;
}

export function resetVoiceNavGuard(guard: VoiceNavGuard): void {
  guard.lastAt = 0;
  guard.lastType = null;
}

/**
 * A distinct non-navigation utterance proves the speaker took another breath,
 * so the next cue may step immediately without waiting out the cooldown.
 */
export function rearmVoiceNav(guard: VoiceNavGuard): void {
  resetVoiceNavGuard(guard);
}
