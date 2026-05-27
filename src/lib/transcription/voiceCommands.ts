import type { TranslationInfo } from "@/lib/tauri";
import { isNavigationPhrase, preprocessTranscriptForDetection } from "@/lib/transcription/transcriptPreprocess";

export type VoiceCommand =
  | { type: "next_verse" }
  | { type: "prev_verse" }
  | { type: "switch_translation"; translation: TranslationInfo; matchedPhrase: string }
  | { type: "none" };

const NEXT_VERSE =
  /\b(?:(?:go\s+to\s+(?:the\s+)?)?next\s+(?:verse|verses|one)|next\s+verse|following\s+verse|advance\s+(?:to\s+)?(?:the\s+)?next\s+verse)\b/i;
const PREV_VERSE =
  /\b(?:(?:go\s+to\s+(?:the\s+)?)?(?:previous|prior|last|preceding)\s+(?:verse|verses|one)|previous\s+verse|go\s+back(?:\s+to\s+(?:the\s+)?(?:previous|last)\s+verse)?|back\s+up\s+(?:a\s+)?verse)\b/i;

/** Spoken names that map to common translation abbreviations / ids. */
const SPOKEN_TRANSLATION_ALIASES: Record<string, string[]> = {
  kjv: ["king james", "king james version", "k j v", "kjv"],
  niv: ["new international version", "new international", "n i v", "niv"],
  esv: ["english standard version", "english standard", "e s v", "esv"],
  nlt: ["new living translation", "new living", "n l t", "nlt"],
  nkjv: ["new king james", "new king james version", "n k j v", "nkjv"],
  amp: ["amplified bible", "amplified", "a m p", "amp"],
  nasb: ["new american standard", "new american standard bible", "n a s b", "nasb"],
  csb: ["christian standard bible", "christian standard", "c s b", "csb"],
  msg: ["the message", "message bible", "m s g", "msg"],
};

function normalizeSpeech(text: string): string {
  return preprocessTranscriptForDetection(text)
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translationKeywords(translation: TranslationInfo): string[] {
  const keys = new Set<string>();
  keys.add(normalizeSpeech(translation.name));
  keys.add(normalizeSpeech(translation.abbreviation));
  keys.add(normalizeSpeech(translation.id));

  const aliasKey = translation.abbreviation.toLowerCase();
  const aliasKey2 = translation.id.toLowerCase();
  for (const [key, aliases] of Object.entries(SPOKEN_TRANSLATION_ALIASES)) {
    if (aliasKey.includes(key) || aliasKey2.includes(key)) {
      aliases.forEach((a) => keys.add(normalizeSpeech(a)));
    }
  }

  if (translation.name.toLowerCase().includes("king james")) {
    SPOKEN_TRANSLATION_ALIASES.kjv.forEach((a) => keys.add(normalizeSpeech(a)));
  }
  if (translation.name.toLowerCase().includes("amplified")) {
    SPOKEN_TRANSLATION_ALIASES.amp.forEach((a) => keys.add(normalizeSpeech(a)));
  }

  return [...keys].filter((k) => k.length >= 2);
}

function matchTranslation(text: string, translations: TranslationInfo[]): TranslationInfo | null {
  const normalized = normalizeSpeech(text);
  if (!normalized) return null;

  let best: { translation: TranslationInfo; phrase: string; score: number } | null = null;

  for (const translation of translations) {
    for (const keyword of translationKeywords(translation)) {
      const explicit =
        normalized.includes(`switch to ${keyword}`) ||
        normalized.includes(`change to ${keyword}`) ||
        normalized.includes(`use ${keyword}`) ||
        normalized.includes(`read from ${keyword}`) ||
        normalized.includes(`read in ${keyword}`) ||
        normalized.includes(`in ${keyword}`) ||
        normalized.includes(`on ${keyword}`) ||
        normalized.includes(`from ${keyword}`);

      const standalone = normalized === keyword || normalized.endsWith(` ${keyword}`) || normalized.startsWith(`${keyword} `);

      if (explicit || standalone) {
        const score = explicit ? keyword.length + 100 : keyword.length;
        if (!best || score > best.score) {
          best = { translation, phrase: keyword, score };
        }
      }
    }
  }

  return best?.translation ?? null;
}

export function parseVoiceCommands(text: string, translations: TranslationInfo[]): VoiceCommand {
  const normalized = normalizeSpeech(text);
  if (!normalized) return { type: "none" };

  if (NEXT_VERSE.test(normalized)) return { type: "next_verse" };
  if (PREV_VERSE.test(normalized)) return { type: "prev_verse" };

  const translation = matchTranslation(normalized, translations);
  if (translation) {
    return { type: "switch_translation", translation, matchedPhrase: normalized };
  }

  return { type: "none" };
}

/** Skip scripture detection for obvious navigation phrases. */
export function isLikelyVoiceCommand(text: string): boolean {
  return isNavigationPhrase(text);
}
