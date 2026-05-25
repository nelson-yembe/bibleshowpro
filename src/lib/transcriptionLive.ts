import { sceneFromVersesWithLayout } from "@/engine/scene";
import type { VerseResult } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";
import type { ScriptureSuggestion } from "@/lib/transcription/types";

export async function previewDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  const theme = useThemeStore.getState().activeTheme;
  usePresentationStore.getState().previewVerses(suggestion.verses, theme, layout);
  usePresentationStore.setState({ previewSource: "transcription" });
}

/** Preview then take live — used when auto-projection is enabled. */
export async function presentDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  await previewDetectedScripture(suggestion, layout);
  await usePresentationStore.getState().goLive();
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
  return suggestion.verses;
}

export function buildPreviewSceneFromSuggestion(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  const theme = useThemeStore.getState().activeTheme;
  return sceneFromVersesWithLayout(suggestion.verses, theme, layout);
}
