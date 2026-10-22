/** Normalize live transcript text before scripture / voice parsing. */
export function preprocessTranscriptForDetection(text: string): string {
  let s = text.trim();

  // Strip leading filler words often picked up by STT.
  s = s.replace(
    /^(?:scripture|the\s+scripture|bible|the\s+bible|read(?:ing)?(?:\s+(?:from|for))?|turn(?:\s+with\s+me)?\s+to|go\s+to|go\s+with|look(?:ing)?\s+at)\s+/i,
    "",
  );

  // Mid-sentence navigation cues: only keep the tail when it clearly announces
  // scripture. A loose "starts with a letter" check used to match "look at them"
  // and wipe earlier refs like "Joshua chapter 14" from the rolling context.
  const midCue = /\b(?:go\s+to|turn\s+to|look(?:ing)?\s+at)\s+/i.exec(s);
  if (midCue && midCue.index != null && midCue.index > 0) {
    const tail = s.slice(midCue.index + midCue[0].length).trimStart();
    if (
      /\b(?:chapter|verse|verses)\b/i.test(tail) ||
      /^(?:[1-3]\s+)?(?:gen(?:esis)?|exo(?:dus)?|lev(?:iticus)?|num(?:bers)?|deut(?:eronomy)?|josh(?:ua)?|judg(?:es)?|ruth|sam(?:uel)?|ki(?:ngs)?|chr(?:onicles)?|ezra|neh(?:emiah)?|est(?:her)?|job|ps(?:alm|alms)?|prov(?:erbs)?|eccl?(?:esiastes)?|song|isa(?:iah)?|jer(?:emiah)?|lam(?:entations)?|ezek(?:iel)?|dan(?:iel)?|hos(?:ea)?|joel|amos|obad(?:iah)?|jonah|mic(?:ah)?|nah(?:um)?|hab(?:akkuk)?|zeph(?:aniah)?|hag(?:gai)?|zech(?:ariah)?|mal(?:achi)?|matt?(?:hew)?|mark|luke|john|acts|rom(?:ans)?|cor(?:inthians)?|gal(?:atians)?|eph(?:esians)?|phil(?:ippians)?|col(?:ossians)?|thess?(?:alonians)?|tim(?:othy)?|titus|philemon|heb(?:rews)?|jas|james|pet(?:er)?|jude|rev(?:elation)?)\b/i.test(
        tail,
      )
    ) {
      s = midCue[0] + tail;
    }
  }

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
  // "evils. 11/1" / "chapter 14. 12" — treat sentence breaks as spaces for refs.
  s = s.replace(/([a-z])\.\s+(\d)/gi, "$1 $2");
  s = s.replace(/(\d)\.\s+(\d)/g, "$1 $2");
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
  s = s.replace(/(\d{1,3})\s*\/\s*(\d{1,3})/g, "$1:$2");
  s = s.replace(/(\d)\s*%/g, "$1");
  s = s.replace(/\bnumbers\s+(?:are|is)\s+(?:the\s+)?(\d{1,3})\b/gi, "Numbers chapter $1");
  s = s.replace(/\bchapter\s+(\d{1,3})\s+(\d{1,3})\b/gi, "chapter $1 verse $2");

  // Gated phonetic book confusions — only when a scripture cue follows.
  const cue = "(?=\\s+(?:chapter|verse|verses|after|that|\\d|/))";
  s = s.replace(new RegExp(`\\befficient\\b${cue}`, "gi"), "Ephesians");
  s = s.replace(new RegExp(`\\bephesis\\b${cue}`, "gi"), "Ephesians");
  s = s.replace(new RegExp(`\\ba\\s+fishing\\b${cue}`, "gi"), "Ephesians");
  s = s.replace(new RegExp(`\\brelationship\\b${cue}`, "gi"), "Revelation");
  s = s.replace(new RegExp(`\\bmarrakesh\\b${cue}`, "gi"), "Malachi");
  s = s.replace(new RegExp(`\\bmalakai\\b${cue}`, "gi"), "Malachi");
  s = s.replace(new RegExp(`\\bevil(?:s)?\\b${cue}`, "gi"), "Hebrews");
  s = s.replace(new RegExp(`\\bhebr(?:ew|ews)?\\b${cue}`, "gi"), "Hebrews");

  // "Ephesians after 5" / "Revelation that 3" / "Malachi after that 3".
  s = s.replace(
    /\b(Ephesians|Revelation|Malachi|Matthew|John|Romans|Acts|Psalms?|Hebrews|Joshua|Numbers)\s+(?:after\s+that|after|that)\s+(\d{1,3})\b/gi,
    "$1 chapter $2",
  );

  return s.replace(/\s+/g, " ").trim();
}

export function isNavigationPhrase(text: string): boolean {
  const normalized = preprocessTranscriptForDetection(text).toLowerCase().replace(/[.,!?;:'"]/g, " ").trim();
  return (
    /\b(?:next|following)\s+(?:verse|verses|one)\b/.test(normalized) ||
    /\b(?:previous|prior|last|preceding)\s+(?:verse|verses|one)\b/.test(normalized) ||
    /\b(?:go|move)\s+(?:to\s+)?next\b/.test(normalized) ||
    /\b(?:go|move)\s+(?:to\s+)?(?:the\s+)?previous\b/.test(normalized) ||
    /\bgo\s+back(?:\s+(?:a\s+)?(?:verse|one))?\b/.test(normalized) ||
    /\bback\s+(?:up\s+)?(?:a\s+)?verse\b/.test(normalized) ||
    /^(?:please\s+)?(?:next|previous|back)(?:\s+please)?$/.test(normalized)
  );
}
