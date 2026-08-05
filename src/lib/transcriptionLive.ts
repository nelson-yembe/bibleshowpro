import {
  sceneFromVerseComparison,
  sceneFromVersesWithLayout,
  type Scene,
  type VerseLayout,
} from "@/engine/scene";
import { lookupVerseInTranslation, lookupVersePairInTranslations } from "@/lib/bibleCompare";
import { api, type VerseResult } from "@/lib/tauri";
import { buildLowerThirdTheme, isLowerThirdScene } from "@/lib/lowerThird";
import { isTranscriptionOnAir } from "@/lib/transcription/transcriptionLiveFollow";
import {
  createExpandedVerseSessionFromSuggestion,
  getCurrentVerse,
  type ActiveVerseSession,
} from "@/lib/transcription/verseSession";
import type { ScriptureSuggestion } from "@/lib/transcription/types";
import { useBibleStore } from "@/stores/bibleStore";
import { isPresentationOnAir, usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";

export function projectionThemeForLayout(layout: "fullscreen" | "lower_third" = "fullscreen") {
  const base = useThemeStore.getState().activeTheme;
  return layout === "lower_third" ? buildLowerThirdTheme(base) : base;
}

function projectionTheme(layout: "fullscreen" | "lower_third" = "fullscreen") {
  return projectionThemeForLayout(layout);
}

/** Same translation order as Bible Search (primary first, optional compare second). */
export function resolvePresentationTranslationIds(): string[] {
  const bible = useBibleStore.getState();
  if (bible.selectedTranslationIds.length > 0) {
    return bible.selectedTranslationIds.slice(0, 2);
  }
  if (bible.selectedTranslationId) return [bible.selectedTranslationId];
  const fallback =
    bible.translations.find((t) => t.is_default)?.id ?? bible.translations[0]?.id ?? "";
  return fallback ? [fallback] : [];
}

export function presentationTranslationLabel(): string {
  const bible = useBibleStore.getState();
  const ids = resolvePresentationTranslationIds();
  const abbrs = ids
    .map((id) => bible.translations.find((t) => t.id === id)?.abbreviation)
    .filter(Boolean);
  return abbrs.length > 0 ? abbrs.join(" · ") : "Bible";
}

function versesFromScene(scene: Scene | null | undefined): VerseResult[] {
  if (!scene?.content.verses?.length) return [];
  return scene.content.verses;
}

/** Resolve verses to re-present when toggling fullscreen ↔ lower third. */
export function resolveTranscriptionVerses(options: {
  verseSession?: ActiveVerseSession | null;
  suggestion?: ScriptureSuggestion | null;
  preview?: Scene | null;
  program?: Scene | null;
}): VerseResult[] {
  const fromSession = options.verseSession ? getCurrentVerse(options.verseSession) : null;
  if (fromSession) return [fromSession];

  const fromSuggestion = options.suggestion?.verses[0];
  if (fromSuggestion) return [fromSuggestion];

  const fromPreview = versesFromScene(options.preview);
  if (fromPreview.length > 0) return fromPreview;
  return versesFromScene(options.program);
}

/** Build a projection scene using the Bible Search translation selection (incl. dual). */
export async function buildTranscriptionVerseScene(
  verse: VerseResult,
  layout: VerseLayout = "fullscreen",
): Promise<Scene> {
  const theme = projectionTheme(layout);
  const ids = resolvePresentationTranslationIds();

  if (ids.length >= 2) {
    const { primary, secondary } = await lookupVersePairInTranslations(verse, ids[0]!, ids[1]!);
    if (primary && secondary) {
      return sceneFromVerseComparison(primary, secondary, theme, layout);
    }
    if (primary) {
      return sceneFromVersesWithLayout([primary], theme, layout);
    }
  }

  const primaryId = ids[0];
  if (primaryId && verse.translation_id !== primaryId) {
    const resolved = await lookupVerseInTranslation(verse, primaryId);
    if (resolved) {
      return sceneFromVersesWithLayout([resolved], theme, layout);
    }
  }

  return sceneFromVersesWithLayout([verse], theme, layout);
}

async function pushTranscriptionScene(scene: Scene, toProgram: boolean) {
  const store = usePresentationStore.getState();
  if (!toProgram) {
    store.previewScene(scene, "transcription");
    return;
  }

  // Already on air (any source that we'll take over) — update program directly.
  if (isPresentationOnAir(store) || store.liveFollow) {
    store.pushSceneLive(scene, "transcription");
    return;
  }

  store.previewScene(scene, "transcription");
  await store.goLive();
}

export async function representTranscriptionVerses(
  verses: VerseResult[],
  layout: "fullscreen" | "lower_third",
  toProgram: boolean,
) {
  const verse = verses[0];
  if (!verse) return;
  const scene = await buildTranscriptionVerseScene(verse, layout);
  await pushTranscriptionScene(scene, toProgram);
}

export function transcriptionSceneMatchesLayout(
  scene: Scene | null | undefined,
  layout: "fullscreen" | "lower_third",
): boolean {
  if (!scene) return true;
  const sceneIsLowerThird = isLowerThirdScene(scene);
  return layout === "lower_third" ? sceneIsLowerThird : !sceneIsLowerThird;
}

export async function presentSingleVerse(
  verse: VerseResult,
  layout: "fullscreen" | "lower_third" = "fullscreen",
  toProgram = false,
) {
  const scene = await buildTranscriptionVerseScene(verse, layout);
  await pushTranscriptionScene(scene, toProgram);
}

export async function presentVerseSession(
  session: ActiveVerseSession,
  layout: "fullscreen" | "lower_third" = "fullscreen",
  toProgram = false,
) {
  const verse = getCurrentVerse(session);
  if (!verse) return;
  await presentSingleVerse(verse, layout, toProgram);
}

export function shouldPresentVerseToProgram(autoGoLive: boolean): boolean {
  return autoGoLive || isTranscriptionOnAir();
}

export async function previewDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
) {
  const session = await createExpandedVerseSessionFromSuggestion(suggestion);
  await presentVerseSession(session, layout, false);
  return session;
}

/** Stage preview then take to program output (opens projector if needed). */
export async function presentDetectedScripture(
  suggestion: ScriptureSuggestion,
  layout: "fullscreen" | "lower_third" = "fullscreen",
): Promise<ActiveVerseSession> {
  const session = await createExpandedVerseSessionFromSuggestion(suggestion);
  await presentVerseSession(session, layout, true);
  return session;
}

export async function reloadVerseSessionTranslation(
  session: ActiveVerseSession,
  translationId: string,
): Promise<ActiveVerseSession | null> {
  try {
    const anchor = getCurrentVerse(session) ?? session.verses[0];
    if (!anchor) return null;

    const lookup = await api.lookupReference(`${anchor.book_name} ${anchor.chapter}`, translationId);
    const verses = lookup.search.verses;
    if (verses.length === 0) return null;

    const verseIndex = verses.findIndex(
      (verse) =>
        verse.book_number === anchor.book_number &&
        verse.chapter === anchor.chapter &&
        verse.verse === anchor.verse,
    );

    return {
      ...session,
      verses,
      verseIndex: verseIndex >= 0 ? verseIndex : Math.min(session.verseIndex, verses.length - 1),
      translationId,
      translationAbbr: verses[0]?.translation_abbr ?? session.translationAbbr,
    };
  } catch {
    return null;
  }
}

export async function queueDetectedScripture(suggestion: ScriptureSuggestion) {
  const service = useServiceStore.getState();
  await service.ensureActivePlan("Live Session");
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
  const theme = projectionTheme(layout);
  const first = suggestion.verses[0];
  if (!first) return null;
  return sceneFromVersesWithLayout([first], theme, layout);
}
