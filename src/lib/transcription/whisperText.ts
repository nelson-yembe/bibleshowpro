/**
 * whisper.cpp annotates non-speech rather than returning nothing: a silent segment
 * comes back as "[BLANK_AUDIO]", background noise as "(music)" and so on.
 *
 * Those are descriptions, not speech. Projecting "[BLANK_AUDIO]" onto a congregation
 * would be worse than projecting nothing, and feeding it to scripture detection is noise.
 */

const ANNOTATION = /[[(][^\])]*[\])]/g;

/**
 * Lines Whisper learned from subtitled video and writes on unclear audio. Matched only
 * as the whole segment: "Thank you" is said in church and stays.
 */
const VIDEO_CREDITS = [
  /^thanks? (?:you )?(?:so much )?for watching[.!]*$/i,
  /^please (?:like and )?subscribe.*$/i,
  /^sous-titr(?:es|age|ée?s?)\b.*$/i,
  /^.*amara\.org.*$/i,
  /^merci d'avoir regardé.*$/i,
  /^(?:abonnez-vous|n'oubliez pas de vous abonner).*$/i,
];

export function cleanWhisperText(raw: string): string {
  const text = raw.replace(ANNOTATION, " ").replace(/\s+/g, " ").trim();
  return VIDEO_CREDITS.some((pattern) => pattern.test(text)) ? "" : text;
}
