/**
 * Operator-feedback correction memory.
 *
 * When the operator goes live on a suggestion or picks an alternative reference,
 * we remember ASR phrase → scripture. Ignores demote noisy false positives.
 * Learned hits are re-applied on future detections (offline, localStorage).
 */

export const CORRECTION_STORAGE_KEY = "bsp-scripture-corrections";

const MAX_ENTRIES = 250;
const MIN_PHRASE_CHARS = 10;
const MIN_ACCEPT_TO_REUSE = 1;
const MIN_IGNORE_TO_SUPPRESS = 2;

export interface CorrectionEntry {
  phraseKey: string;
  phraseSample: string;
  reference: string;
  acceptCount: number;
  ignoreCount: number;
  updatedAt: string;
}

export interface LearnedReferenceHit {
  reference: string;
  confidence: number;
  phraseKey: string;
  acceptCount: number;
}

type CorrectionStore = Record<string, CorrectionEntry>;

/** Composite key: normalizedPhrase|||normalizedReference */
function entryKey(phraseKey: string, reference: string): string {
  return `${phraseKey}|||${normalizeReferenceKey(reference)}`;
}

export function normalizePhraseKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function normalizeReferenceKey(reference: string): string {
  return reference.toLowerCase().replace(/\s+/g, " ").trim();
}

function loadStore(): CorrectionStore {
  try {
    const raw = localStorage.getItem(CORRECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CorrectionStore;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function persistStore(store: CorrectionStore) {
  try {
    const entries = Object.values(store).sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    const trimmed: CorrectionStore = {};
    for (const entry of entries.slice(0, MAX_ENTRIES)) {
      trimmed[entryKey(entry.phraseKey, entry.reference)] = entry;
    }
    localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota / private mode */
  }
}

function upsert(
  store: CorrectionStore,
  phrase: string,
  reference: string,
  mutate: (entry: CorrectionEntry) => void,
): CorrectionEntry | null {
  const phraseKey = normalizePhraseKey(phrase);
  const ref = reference.trim();
  if (phraseKey.length < MIN_PHRASE_CHARS || !ref) return null;

  const key = entryKey(phraseKey, ref);
  const existing = store[key] ?? {
    phraseKey,
    phraseSample: phrase.trim().slice(0, 180),
    reference: ref,
    acceptCount: 0,
    ignoreCount: 0,
    updatedAt: new Date().toISOString(),
  };
  mutate(existing);
  existing.updatedAt = new Date().toISOString();
  existing.phraseSample = phrase.trim().slice(0, 180);
  store[key] = existing;
  return existing;
}

function netScore(entry: CorrectionEntry): number {
  return entry.acceptCount - entry.ignoreCount;
}

/** Operator confirmed this phrase → reference (Go live / Auto live). */
export function recordCorrectionAccept(phrase: string, reference: string): void {
  const store = loadStore();
  const entry = upsert(store, phrase, reference, (e) => {
    e.acceptCount += 1;
  });
  if (entry) persistStore(store);
}

/** Operator dismissed a false positive. */
export function recordCorrectionIgnore(phrase: string, reference: string): void {
  const store = loadStore();
  const entry = upsert(store, phrase, reference, (e) => {
    e.ignoreCount += 1;
  });
  if (entry) persistStore(store);
}

/**
 * Operator chose an alternative reference for the same ASR phrase.
 * Strengthens the corrected mapping and demotes the rejected one.
 */
export function recordCorrectionOverride(
  phrase: string,
  fromReference: string,
  toReference: string,
): void {
  if (normalizeReferenceKey(fromReference) === normalizeReferenceKey(toReference)) {
    recordCorrectionAccept(phrase, toReference);
    return;
  }
  const store = loadStore();
  upsert(store, phrase, fromReference, (e) => {
    e.ignoreCount += 1;
  });
  upsert(store, phrase, toReference, (e) => {
    e.acceptCount += 2;
  });
  persistStore(store);
}

/**
 * Find the best learned reference for transcript text.
 * Prefers longer phrase keys that appear in the text (or vice versa).
 */
export function lookupLearnedReference(text: string): LearnedReferenceHit | null {
  const haystack = normalizePhraseKey(text);
  if (haystack.length < MIN_PHRASE_CHARS) return null;

  const store = loadStore();
  let best: CorrectionEntry | null = null;

  for (const entry of Object.values(store)) {
    if (entry.acceptCount < MIN_ACCEPT_TO_REUSE) continue;
    if (netScore(entry) < 1) continue;

    const key = entry.phraseKey;
    const matches =
      haystack === key ||
      (key.length >= MIN_PHRASE_CHARS && haystack.includes(key)) ||
      (haystack.length >= MIN_PHRASE_CHARS && key.includes(haystack) && haystack.length >= 24);

    if (!matches) continue;

    if (
      !best ||
      key.length > best.phraseKey.length ||
      (key.length === best.phraseKey.length && netScore(entry) > netScore(best))
    ) {
      best = entry;
    }
  }

  if (!best) return null;

  const confidence = Math.min(0.9, 0.72 + Math.min(best.acceptCount, 6) * 0.03);
  return {
    reference: best.reference,
    confidence,
    phraseKey: best.phraseKey,
    acceptCount: best.acceptCount,
  };
}

/** Drop suggestions the operator repeatedly ignored for this phrase. */
export function shouldSuppressSuggestion(phrase: string, reference: string): boolean {
  const phraseKey = normalizePhraseKey(phrase);
  if (phraseKey.length < MIN_PHRASE_CHARS) return false;
  const store = loadStore();
  const entry = store[entryKey(phraseKey, reference)];
  if (!entry) {
    // Also suppress when a longer stored phrase contains this text / vice versa.
    for (const candidate of Object.values(store)) {
      if (normalizeReferenceKey(candidate.reference) !== normalizeReferenceKey(reference)) {
        continue;
      }
      if (candidate.ignoreCount < MIN_IGNORE_TO_SUPPRESS) continue;
      if (candidate.acceptCount >= candidate.ignoreCount) continue;
      if (
        phraseKey.includes(candidate.phraseKey) ||
        candidate.phraseKey.includes(phraseKey)
      ) {
        return true;
      }
    }
    return false;
  }
  return (
    entry.ignoreCount >= MIN_IGNORE_TO_SUPPRESS && entry.ignoreCount > entry.acceptCount
  );
}

export function listCorrectionEntries(): CorrectionEntry[] {
  return Object.values(loadStore()).sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export function clearCorrectionMemory(): void {
  try {
    localStorage.removeItem(CORRECTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
