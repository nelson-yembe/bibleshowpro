import type { VerseLayout } from "@/engine/scene";
import { lookupVerseInTranslation, lookupVersePairInTranslations } from "@/lib/bibleCompare";
import { buildLowerThirdTheme } from "@/lib/lowerThird";
import type { BibleSearchOptions, ThemeConfig, VerseResult } from "@/lib/tauri";
import { useBibleStagingStore, type PresentationOverlays } from "@/stores/bibleStagingStore";
import { useBibleStore } from "@/stores/bibleStore";
import { useBibleViewStore, type BibleViewMode } from "@/stores/bibleViewStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useThemeStore } from "@/stores/themeStore";

/**
 * The Bible page's actions, outside the page: the page and the phone remote both call
 * these, so a verse picked in either place is staged the same way and both show it.
 */

export function bibleLayout(mode: BibleViewMode = useBibleViewStore.getState().viewMode): VerseLayout {
  return mode === "lower_third" ? "lower_third" : "fullscreen";
}

export function bibleTheme(layout: VerseLayout = bibleLayout()): ThemeConfig {
  const theme = useThemeStore.getState().activeTheme;
  return layout === "lower_third" ? buildLowerThirdTheme(theme) : theme;
}

export function bibleOverlays(): PresentationOverlays {
  const d = useBibleViewStore.getState().localDisplay;
  return {
    highlightPhrase: d.highlightPhrase,
    highlightColor: d.highlightColor,
    emphasis: d.emphasis,
    backgroundPreset: d.backgroundPreset,
  };
}

export function bibleTranslationIds(): string[] {
  const { selectedTranslationIds, selectedTranslationId } = useBibleStore.getState();
  if (selectedTranslationIds.length > 0) return selectedTranslationIds;
  return selectedTranslationId ? [selectedTranslationId] : [];
}

let presentSequence = 0;

/** Stage one verse in the chosen translation(s), view and overlays; the newest call wins. */
export async function presentBibleVerse(verse: VerseResult, layoutOverride?: VerseLayout): Promise<void> {
  const sequence = ++presentSequence;
  const layout = layoutOverride ?? bibleLayout();
  const theme = bibleTheme(layout);
  const ids = bibleTranslationIds();
  const staging = useBibleStagingStore.getState();

  if (ids.length >= 2) {
    const { primary, secondary } = await lookupVersePairInTranslations(verse, ids[0], ids[1]);
    if (sequence !== presentSequence) return;
    if (primary && secondary) {
      staging.stageVerseComparison(primary, secondary, theme, layout, bibleOverlays());
      return;
    }
    if (primary) {
      staging.stageVerses([primary], theme, layout, bibleOverlays());
      return;
    }
  }

  const primaryId = ids[0];
  const resolved = primaryId ? await lookupVerseInTranslation(verse, primaryId) : verse;
  if (sequence !== presentSequence) return;
  staging.stageVerses([resolved ?? verse], theme, layout, bibleOverlays());
}

/** Make `verse` the selection everywhere and stage it. */
export function applyBibleVerseSelection(verse: VerseResult, index?: number): void {
  const view = useBibleViewStore.getState();
  view.setSelectedGroup([verse]);
  view.setSelectedVerseId(verse.id);
  if (index !== undefined) view.setActiveSlideIndex(index);
  view.setLocalDisplay((o) => ({ ...o, verseStart: String(verse.verse), verseEnd: String(verse.verse) }));
  void presentBibleVerse(verse);
}

/** Pick a verse of the loaded chapter by its position. */
export function selectBibleVerse(index: number): boolean {
  const verses = useBibleStore.getState().chapterVerses;
  if (index < 0 || index >= verses.length) return false;
  useBibleStore.getState().setActiveVerseIndex(index);
  applyBibleVerseSelection(verses[index], index);
  return true;
}

/** Open a search result in its chapter and select it. */
export async function selectBibleSearchResult(verse: VerseResult): Promise<void> {
  await useBibleStore.getState().loadChapterForVerse(verse);
  const { activeVerseIndex, chapterVerses } = useBibleStore.getState();
  applyBibleVerseSelection(chapterVerses[activeVerseIndex] ?? verse, activeVerseIndex);
}

/** Search words or a reference; a reference opens its chapter at the verse. */
export async function runBibleSearch(query?: string, options?: BibleSearchOptions): Promise<boolean> {
  const ok = await useBibleStore.getState().search(query, options);
  const verse = useBibleStore.getState().getActiveVerse();
  if (verse) applyBibleVerseSelection(verse, useBibleStore.getState().activeVerseIndex);
  return ok;
}

/** The passage picker's Go: book, chapter and verse. */
export function goToBiblePassage(book: string, chapter: string | number, verse: string | number, options?: BibleSearchOptions) {
  const query = `${book} ${chapter}:${verse}`;
  useBibleStore.getState().setQuery(query);
  return runBibleSearch(query, options);
}

/** A slide in the strip: a verse of the chapter, or one search result. */
export async function goToBibleSlide(index: number): Promise<void> {
  const { chapterVerses, groups } = useBibleStore.getState();
  if (chapterVerses.length > 0) {
    selectBibleVerse(index);
    return;
  }
  const { selectedGroup } = useBibleViewStore.getState();
  const slides = groups.length > 0 ? groups : selectedGroup ? [selectedGroup] : [];
  const group = slides[index];
  if (!group?.[0]) return;
  await selectBibleSearchResult(group[0]);
  useBibleViewStore.getState().setActiveSlideIndex(index);
}

/** Previous or next verse, or search result when no chapter is open. */
export function stepBibleVerse(delta: number): void {
  const { chapterVerses, activeVerseIndex } = useBibleStore.getState();
  if (chapterVerses.length > 0) {
    selectBibleVerse(activeVerseIndex + delta);
    return;
  }
  void goToBibleSlide(useBibleViewStore.getState().activeSlideIndex + delta);
}

/** Primary and compare translations, as the pills choose them; the chapter follows. */
export async function toggleBibleTranslation(id: string): Promise<void> {
  const before = bibleTranslationIds().join(",");
  useBibleStore.getState().toggleTranslationSelection(id);
  if (bibleTranslationIds().join(",") === before) return;
  if (useBibleStore.getState().chapterVerses.length > 0) {
    await useBibleStore.getState().reloadActiveChapterForPrimary();
  }
  const active = useBibleStore.getState().getActiveVerse();
  if (active) await presentBibleVerse(active);
}

/** Switch the view tab and restage what is selected in it. */
export function setBibleViewMode(mode: BibleViewMode): void {
  useBibleViewStore.getState().setViewMode(mode);
  const layout = bibleLayout(mode);
  const active = useBibleStore.getState().getActiveVerse();
  if (active) {
    void presentBibleVerse(active, layout);
    return;
  }
  if (mode === "compare" || mode === "reader") return;
  const verses = useBibleStagingStore.getState().stagedScene?.content.verses;
  if (!verses?.length) return;
  useBibleStagingStore.getState().stageVerses(verses, bibleTheme(layout), layout, bibleOverlays());
}

/** Before a take: the staged verse, with the current overlays, becomes the preview. */
export async function prepareBibleGoLive(): Promise<void> {
  useBibleStagingStore.getState().applyOverlays(bibleOverlays());
  const scene = useBibleStagingStore.getState().stagedScene;
  if (scene) {
    usePresentationStore.getState().preparePreviewForGoLive(scene, "bible");
    return;
  }
  const active = useBibleStore.getState().getActiveVerse();
  if (active) await presentBibleVerse(active);
}

/**
 * Put the staged verse on air. Unlike the global take, this never asks the page the
 * operator has open to restage its own content first: the remote asked for this verse.
 */
export async function takeStagedBibleLive(): Promise<boolean> {
  useBibleStagingStore.getState().applyOverlays(bibleOverlays());
  const scene = useBibleStagingStore.getState().stagedScene;
  if (!scene) return false;
  const presentation = usePresentationStore.getState();
  if (!presentation.outputOpen) {
    try {
      await presentation.openOutput();
    } catch {
      return false;
    }
  }
  usePresentationStore.getState().pushSceneLive(scene, "bible");
  return true;
}
