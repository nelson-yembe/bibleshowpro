/** Normalize live transcript text before scripture / voice parsing. */
export function preprocessTranscriptForDetection(text: string): string {
  let s = text.trim();

  // Strip leading filler words often picked up by STT.
  s = s.replace(/^(?:scripture|the\s+scripture|bible|the\s+bible|read(?:ing)?|turn(?:\s+with\s+me)?\s+to)\s+/i, "");

  // "ScriptureJohn" / "BibleMatthew" — filler glued to book name.
  s = s.replace(/^(?:scripture|bible)([a-z])/i, "$1");

  // Common speech mishears for book names.
  s = s.replace(/\bjoin\b/gi, "John");

  // Ordinal book prefixes: "2nd Peter" / "Second Peter" → "2 Peter"
  s = s.replace(/\b(1st|first)\s+/gi, "1 ");
  s = s.replace(/\b(2nd|second)\s+/gi, "2 ");
  s = s.replace(/\b(3rd|third)\s+/gi, "3 ");

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

  // Pulpit bridge: "chapter 1. We begin from verse one" → "chapter 1 verse one"
  s = s.replace(
    /\b(?:(?:we\s+|let'?s\s+|let\s+us\s+)?(?:begin|beginning|start|starting)\s+(?:from|at|in)|(?:we\s+)?(?:look|looking)\s+at|open\s+(?:at|from)|read\s+from)\s+(?:the\s+)?(?:verse|verses)\b/gi,
    "verse",
  );
  s = s.replace(/\b(?:from|at|in)\s+(?:the\s+)?(verse|verses)\b/gi, "$1");
  // "chapter 1. verse 1" after bridge collapse (period left from sentence break)
  s = s.replace(/(\d)\s*[.]\s*(verse|verses)\b/gi, "$1 $2");

  // ASR pattern repairs (mirror Rust detector — client fallback only).
  s = s.replace(
    /\bchapter\s+(\d{1,3})\s+chapter\s+(\d{1,3})\s+(?:from\s+)?(?:verse|verses)\b/gi,
    "chapter $2 verse",
  );
  s = s.replace(/\bchapter\s+(\d{1,3})\s*[.,]?\s*was\s+(\d{1,3})\b/gi, "chapter $1 verse $2");
  s = s.replace(/(\d)\s*\+\s*(\d)/g, "$1 $2");
  s = s.replace(/(\d)\s*%/g, "$1");

  // Gated phonetic book confusions — only when a scripture cue follows.
  const cue = "(?=\\s+(?:chapter|verse|verses|after|that|\\d))";
  s = s.replace(new RegExp(`\\befficient\\b${cue}`, "gi"), "Ephesians");
  s = s.replace(new RegExp(`\\bephesis\\b${cue}`, "gi"), "Ephesians");
  s = s.replace(new RegExp(`\\brelationship\\b${cue}`, "gi"), "Revelation");
  s = s.replace(new RegExp(`\\bmarrakesh\\b${cue}`, "gi"), "Malachi");
  s = s.replace(new RegExp(`\\bmalakai\\b${cue}`, "gi"), "Malachi");

  // "Ephesians after 5" / "Revelation that 3" / "Malachi after that 3".
  s = s.replace(
    /\b(Ephesians|Revelation|Malachi|Matthew|John|Romans|Acts|Psalms?)\s+(?:after\s+that|after|that)\s+(\d{1,3})\b/gi,
    "$1 chapter $2",
  );

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
