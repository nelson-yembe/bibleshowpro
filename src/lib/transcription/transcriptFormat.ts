export interface TranscriptSegmentLike {
  text: string;
  offsetMs: number;
  isFinal?: boolean;
}

const WORD_PAUSE_MS = 1200;
const SENTENCE_PAUSE_MS = 2200;
const PARAGRAPH_PAUSE_MS = 4500;

function cleanPhrase(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function endsWithPunctuation(text: string): boolean {
  return /[.!?…,:;]$/.test(text.trim());
}

function capitalize(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function joinPhrases(current: string, next: string, gapMs: number): string {
  const phrase = cleanPhrase(next);
  if (!phrase) return current;

  const base = current.trim();
  if (!base) return capitalize(phrase);

  if (gapMs >= PARAGRAPH_PAUSE_MS) {
    return `${ensureTerminalPunctuation(base)}\n\n${capitalize(phrase)}`;
  }

  if (gapMs >= SENTENCE_PAUSE_MS) {
    return `${ensureTerminalPunctuation(base)} ${capitalize(phrase)}`;
  }

  if (gapMs >= WORD_PAUSE_MS) {
    if (endsWithPunctuation(base)) return `${base} ${phrase}`;
    return `${base}, ${phrase}`;
  }

  return `${base} ${phrase}`;
}

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

/** Readable sermon-style transcript without per-phrase timestamps. */
export function formatTranscriptProse(
  segments: TranscriptSegmentLike[],
  partialText = "",
): string {
  const finals = segments.filter((s) => s.isFinal !== false && cleanPhrase(s.text));
  if (finals.length === 0) {
    return partialText.trim();
  }

  let prose = capitalize(cleanPhrase(finals[0].text));
  for (let i = 1; i < finals.length; i += 1) {
    const gap = Math.max(0, finals[i].offsetMs - finals[i - 1].offsetMs);
    prose = joinPhrases(prose, finals[i].text, gap);
  }

  const partial = partialText.trim();
  if (partial) {
    prose = prose ? `${prose} ${partial}` : partial;
  }

  return prose;
}

/** Export format with timestamps for saved session archives. */
export function formatTranscriptWithTimestamps(
  segments: Array<{ text: string; isFinal?: boolean; timestamp?: string; offsetMs?: number }>,
): string {
  return segments
    .filter((s) => s.isFinal !== false)
    .map((s) => (s.timestamp ? `[${s.timestamp}] ${s.text}` : s.text))
    .join("\n");
}
