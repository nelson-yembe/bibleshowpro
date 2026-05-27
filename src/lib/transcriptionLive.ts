import { sceneFromVersesWithLayout } from "@/engine/scene";
import { api, type VerseResult } from "@/lib/tauri";
import { isTranscriptionOnAir } from "@/lib/transcription/transcriptionLiveFollow";
import {
  createVerseSessionFromSuggestion,
  getCurrentVerse,
  type ActiveVerseSession,
} from "@/lib/transcription/verseSession";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";
import type { ScriptureSuggestion } from "@/lib/transcription/types";

export async function presentSingleVerse(
  verse: VerseResult,
  layout: "fullscreen" | "lower_third" = "fullscreen",
  followProgramIfLive = false,
) {
  const theme = useThemeStore.getState().activeTheme;
  const store = usePresentationStore.getState();
  const onAir = followProgramIfLive && isTranscriptionOnAir();

  if (onAir) {
    store.showVerses([verse], theme, layout);
    usePresentationStore.setState({ previewSource: "transcription" });
    return;
  }

  store.previewVerses([verse], theme, layout);
  usePresentationStore.setState({ previewSource: "transcription" });
}

export async function presentVerseSession(
  session: ActiveVerseSession,
  layout: "fullscreen" | "lower_third" = "fullscreen",
  followProgramIfLive = false,
) {
  const verse = getCurrentVerse(session);
  if (!verse) return;
  await presentSingleVerse(verse, layout, followProgramIfLive);
}

export async function previewDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  const session = createVerseSessionFromSuggestion(suggestion);
  await presentVerseSession(session, layout, isTranscriptionOnAir());
  return session;
}

/** Stage preview then take to program output. */
export async function presentDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
): Promise<ActiveVerseSession> {
  const session = createVerseSessionFromSuggestion(suggestion);
  await presentVerseSession(session, layout, false);
  await usePresentationStore.getState().goLive();
  return session;
}

export async function reloadVerseSessionTranslation(
  session: ActiveVerseSession,
  translationId: string,
): Promise<ActiveVerseSession | null> {
  try {
    const lookup = await api.lookupReference(session.passageReference, translationId);
    const verses = lookup.search.verses;
    if (verses.length === 0) return null;

    const verseIndex = Math.min(session.verseIndex, verses.length - 1);
    return {
      ...session,
      verses,
      verseIndex,
      translationId,
      translationAbbr: verses[0]?.translation_abbr ?? session.translationAbbr,
    };
  } catch {
    return null;
  }
}

export async function queueDetectedScripture(suggestion: ScriptureSuggestion) {
  const service = useServiceStore.getState();
  if (!service.activePlan) {
    await service.createPlan("Live Session");
  }
  await service.addItem(
    "scripture",
    suggestion.reference,
    JSON.stringify({
      reference: suggestion.reference,
      verses: suggestion.verses,
      translationId: suggestion.translationId,
      source: "transcription",
    }),
  );
}

export function suggestionSceneVerses(suggestion: ScriptureSuggestion): VerseResult[] {
  return suggestion.verses.length > 0 ? [suggestion.verses[0]] : [];
}

export function buildPreviewSceneFromSuggestion(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  const theme = useThemeStore.getState().activeTheme;
  const first = suggestion.verses[0];
  if (!first) return null;
  return sceneFromVersesWithLayout([first], theme, layout);
}
