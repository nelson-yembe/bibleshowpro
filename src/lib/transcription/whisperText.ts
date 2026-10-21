/**
 * whisper.cpp annotates non-speech rather than returning nothing: a silent segment
 * comes back as "[BLANK_AUDIO]", background noise as "(music)" and so on.
 *
 * Those are descriptions, not speech. Projecting "[BLANK_AUDIO]" onto a congregation
 * would be worse than projecting nothing, and feeding it to scripture detection is noise.
 */

const ANNOTATION = /[[(][^\])]*[\])]/g;

export function cleanWhisperText(raw: string): string {
  return raw.replace(ANNOTATION, " ").replace(/\s+/g, " ").trim();
}
