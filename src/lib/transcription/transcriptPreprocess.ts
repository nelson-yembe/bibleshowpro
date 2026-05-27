/** Normalize live transcript text before scripture / voice parsing. */
export function preprocessTranscriptForDetection(text: string): string {
  let s = text.trim();

  // Strip leading filler words often picked up by STT.
  s = s.replace(/^(?:scripture|the\s+scripture|bible|the\s+bible|read(?:ing)?|turn(?:\s+with\s+me)?\s+to)\s+/i, "");

  // "ScriptureJohn" / "BibleMatthew" — filler glued to book name.
  s = s.replace(/^(?:scripture|bible)([a-z])/i, "$1");

  // Common speech mishears for book names.
  s = s.replace(/\bjoin\b/gi, "John");

  // Normalize punctuation between book / chapter / verse.
  s = s.replace(/([a-z]),\s*chapter/gi, "$1 chapter");
  s = s.replace(/chapter\s+(\d+)\s*,\s*verse/gi, "chapter $1 verse");
  // Keep numeric ranges like "1-2"; split spoken compounds like "forty-seven".
  s = s.replace(/-/g, (_match, offset, whole: string) => {
    const prev = whole[offset - 1];
    const next = whole[offset + 1];
    if (prev && next && /\d/.test(prev) && /\d/.test(next)) return "-";
    return " ";
  });

  return s.replace(/\s+/g, " ").trim();
}

export function isNavigationPhrase(text: string): boolean {
  const normalized = preprocessTranscriptForDetection(text).toLowerCase().replace(/[.,!?;:'"]/g, " ").trim();
  return (
    /\b(?:next|following)\s+(?:verse|verses|one)\b/.test(normalized) ||
    /\bnext\s+verse\b/.test(normalized) ||
    /\b(?:previous|prior|last|preceding)\s+(?:verse|verses|one)\b/.test(normalized) ||
    /\bprevious\s+verse\b/.test(normalized) ||
    /\bgo\s+back\b/.test(normalized)
  );
}
