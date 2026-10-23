import { BibleSearchSidebar } from "@/modules/bible/BibleSearchSidebar";
import { BibleStagingPanel } from "@/modules/bible/BibleStagingPanel";
import { FormatControls, DEFAULT_THEME_FIELDS } from "@/components/presentation/FormatControls";
import {
  readPreviewTextSelection,
  type HighlightMenuState,
} from "@/components/presentation/PreviewHighlightMenu";
import { SlideThumbnail } from "@/components/presentation/SlideThumbnail";
import {
  buildDisplayOptions,
  type LocalDisplayOverrides,
} from "@/components/presentation/displayOptions";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import { TopBar } from "@/components/layout/TopBar";
import { TranslationCompare } from "@/modules/bible/TranslationCompare";
import { LowerThirdSettingsModal } from "@/components/presentation/LowerThirdSettingsModal";
import { LowerThirdSettingsTrigger } from "@/components/presentation/LowerThirdSettingsTrigger";
import { buildLowerThirdTheme, isLowerThirdScene } from "@/lib/lowerThird";
import { useLowerThirdSettings } from "@/hooks/useLowerThirdSettings";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  SplitSquareHorizontal,
} from "lucide-react";
import { useBibleStore } from "@/stores/bibleStore";
import { useBibleStagingStore } from "@/stores/bibleStagingStore";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { useLiveDisplayStore } from "@/stores/liveDisplayStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";
import { useLowerThirdStore } from "@/stores/lowerThirdStore";
import { useBibleViewStore, type BibleViewMode } from "@/stores/bibleViewStore";
import type { VerseResult } from "@/lib/tauri";
import {
  goToBibleSlide,
  prepareBibleGoLive,
  presentBibleVerse,
  runBibleSearch,
  selectBibleSearchResult,
  selectBibleVerse,
  setBibleViewMode,
  stepBibleVerse,
} from "@/lib/bibleSession";

const viewTabs: { value: BibleViewMode; label: string }[] = [
  { value: "fullscreen", label: "Fullscreen" },
  { value: "lower_third", label: "Lower Third" },
  { value: "compare", label: "Compare" },
  { value: "reader", label: "Reader" },
];

export function BibleSearchPage() {
  const chapterVerses = useBibleStore((s) => s.chapterVerses);
  const groups = useBibleStore((s) => s.groups);
  const activeVerseIndex = useBibleStore((s) => s.activeVerseIndex);
  const selectedTranslationId = useBibleStore((s) => s.selectedTranslationId);
  const selectedTranslationIds = useBibleStore((s) => s.selectedTranslationIds);
  const translations = useBibleStore((s) => s.translations);
  const setQuery = useBibleStore((s) => s.setQuery);

  const liveOnAir = usePresentationStore(
    (s) => s.liveFollow && !!s.program && s.program.type !== "blackout",
  );

  const stagedScene = useBibleStagingStore((s) => s.stagedScene);
  const { activePlan, addItem, ensureActivePlan } = useServiceStore();
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const themeRevision = useThemeStore((s) => s.themeRevision);

  // Selection lives in a store so the phone remote and this page show one selection.
  const viewMode = useBibleViewStore((s) => s.viewMode);
  const selectedGroup = useBibleViewStore((s) => s.selectedGroup);
  const selectedVerseId = useBibleViewStore((s) => s.selectedVerseId);
  const localDisplay = useBibleViewStore((s) => s.localDisplay);
  const setLocalDisplay = useBibleViewStore((s) => s.setLocalDisplay);
  const activeSlideIndex = useBibleViewStore((s) => s.activeSlideIndex);
  const previewRef = useRef<HTMLDivElement>(null);
  const [highlightMenu, setHighlightMenu] = useState<HighlightMenuState | null>(null);
  const [lowerThirdSettingsOpen, setLowerThirdSettingsOpen] = useState(false);
  const lowerThirdSettings = useLowerThirdSettings();
  const showLowerThirdSafeMargins = useLowerThirdStore((s) => s.showLowerThirdSafeMargins);
  const lowerThirdChromaPreview = useLowerThirdStore((s) => s.lowerThirdChromaPreview);

  /** Typography comes from Themes; Bible Search only keeps verse/session overrides */
  const effectiveTheme = useMemo(
    () => (viewMode === "lower_third" ? buildLowerThirdTheme(activeTheme) : activeTheme),
    [activeTheme, themeRevision, viewMode],
  );

  const displayOptions = useMemo(
    () => buildDisplayOptions(effectiveTheme, localDisplay),
    [effectiveTheme, localDisplay],
  );

  const presentationOverlays = useMemo(
    () => ({
      highlightPhrase: localDisplay.highlightPhrase,
      highlightColor: localDisplay.highlightColor,
      emphasis: localDisplay.emphasis,
      backgroundPreset: localDisplay.backgroundPreset,
    }),
    [
      localDisplay.highlightPhrase,
      localDisplay.highlightColor,
      localDisplay.emphasis,
      localDisplay.backgroundPreset,
    ],
  );
  const presentationOverlaysRef = useRef(presentationOverlays);
  presentationOverlaysRef.current = presentationOverlays;

  const effectiveLowerThird = effectiveTheme.lowerThird;
  const isLowerThirdMode = viewMode === "lower_third";

  const handleDisplayChange = useCallback((patch: Partial<DisplayOptions>) => {
    const localPatch: Partial<LocalDisplayOverrides> = {};
    if (patch.verseStart !== undefined) localPatch.verseStart = patch.verseStart;
    if (patch.verseEnd !== undefined) localPatch.verseEnd = patch.verseEnd;
    if (patch.highlightPhrase !== undefined) localPatch.highlightPhrase = patch.highlightPhrase;
    if (patch.highlightColor !== undefined) localPatch.highlightColor = patch.highlightColor;
    if (patch.emphasis !== undefined) localPatch.emphasis = patch.emphasis;
    if (patch.backgroundPreset !== undefined) localPatch.backgroundPreset = patch.backgroundPreset;
    if (Object.keys(localPatch).length > 0) {
      setLocalDisplay((prev) => ({ ...prev, ...localPatch }));
    }
  }, [setLocalDisplay]);

  const verseLayout = viewMode === "lower_third" ? "lower_third" : "fullscreen";

  const resolvedTranslationIds = useMemo(() => {
    if (selectedTranslationIds.length > 0) return selectedTranslationIds;
    return selectedTranslationId ? [selectedTranslationId] : [];
  }, [selectedTranslationIds, selectedTranslationId]);

  useEffect(() => {
    if (!isLowerThirdMode) return;
    const active = useBibleStore.getState().getActiveVerse();
    if (active) void presentBibleVerse(active);
  }, [activeTheme.lowerThird, themeRevision, isLowerThirdMode]);

  // Re-stage locally when view mode / layout / theme changes (no presentationStore reads).
  useEffect(() => {
    const layout = verseLayout;
    const active = useBibleStore.getState().getActiveVerse();
    if (active) {
      void presentBibleVerse(active, layout);
      return;
    }
    const staged = useBibleStagingStore.getState().stagedScene;
    if (!staged?.content.verses?.length) return;
    const sceneIsLowerThird = isLowerThirdScene(staged);
    const wantsLowerThird = layout === "lower_third";
    if (sceneIsLowerThird === wantsLowerThird) return;
    const theme = wantsLowerThird ? buildLowerThirdTheme(activeTheme) : activeTheme;
    useBibleStagingStore
      .getState()
      .stageVerses(staged.content.verses, theme, layout, presentationOverlaysRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bible staging only
  }, [viewMode, verseLayout, themeRevision]);

  // Keep highlight / emphasis / background on stage + live projector in sync.
  useEffect(() => {
    useBibleStagingStore.getState().applyOverlays(presentationOverlays);
  }, [presentationOverlays]);

  useEffect(() => {
    const refreshForTranslations = async () => {
      const store = useBibleStore.getState();
      if (store.chapterVerses.length > 0) {
        await store.reloadActiveChapterForPrimary();
      }
      const active = useBibleStore.getState().getActiveVerse();
      if (active) await presentBibleVerse(active);
    };
    void refreshForTranslations();
  }, [resolvedTranslationIds.join(",")]);

  const handleSelectVerseIndex = useCallback((index: number) => {
    selectBibleVerse(index);
  }, []);

  const handleSelectSearchResult = useCallback((verse: VerseResult) => {
    void selectBibleSearchResult(verse);
  }, []);

  const selectedAbbr =
    translations.find((t) => t.id === selectedTranslationId)?.abbreviation ?? "ESV";

  const selectedAbbrLabel = useMemo(() => {
    const abbrs = resolvedTranslationIds
      .map((id) => translations.find((t) => t.id === id)?.abbreviation)
      .filter(Boolean);
    return abbrs.length > 0 ? abbrs.join(" · ") : selectedAbbr;
  }, [resolvedTranslationIds, translations, selectedAbbr]);

  const secondaryTranslationId = resolvedTranslationIds[1];
  const isDualTranslation = resolvedTranslationIds.length >= 2;

  const inChapterMode = chapterVerses.length > 0;
  const isCompare = viewMode === "compare";
  const slideGroups = inChapterMode
    ? chapterVerses.map((v) => [v])
    : groups.length > 0
      ? groups
      : selectedGroup
        ? [selectedGroup]
        : [];
  const activeVerse =
    (inChapterMode ? chapterVerses[activeVerseIndex] : null) ?? selectedGroup?.[0] ?? null;
  const activeReference = activeVerse?.reference ?? stagedScene?.content.reference ?? "Select a passage";
  const activeReferenceUpper = activeReference.toUpperCase();
  const activeSlideIndexResolved = inChapterMode ? activeVerseIndex : activeSlideIndex;
  const navigableLength = inChapterMode ? chapterVerses.length : slideGroups.length;
  const navigableIndex = activeSlideIndexResolved;

  useEffect(() => {
    useLiveDisplayStore.getState().setDisplayOptions(displayOptions);
    return () => useLiveDisplayStore.getState().setDisplayOptions(undefined);
  }, [displayOptions]);

  useEffect(() => {
    useLiveNavigationStore.getState().register({
      onPrev: () => stepBibleVerse(-1),
      onNext: () => stepBibleVerse(1),
      canPrev: navigableLength > 0 && navigableIndex > 0,
      canNext: navigableLength > 0 && navigableIndex < navigableLength - 1,
      label: "Bible slides",
      beforeGoLive: prepareBibleGoLive,
    });
    return () => useLiveNavigationStore.getState().unregister();
  }, [navigableLength, navigableIndex]);

  const goToSlide = (index: number) => {
    void goToBibleSlide(index);
  };

  const handleSplit = async () => {
    if (!selectedGroup?.[0]) return;
    const ref = selectedGroup[0];
    const q = `${ref.book_name} ${ref.chapter}:${displayOptions.verseStart}-${displayOptions.verseEnd}`;
    setQuery(q);
    await runBibleSearch(q);
  };

  const expandVerseRange = () => {
    const end = Number(displayOptions.verseEnd);
    if (Number.isNaN(end)) return;
    setLocalDisplay((o) => ({ ...o, verseEnd: String(end + 1) }));
  };

  const addToService = useCallback(
    async (reference: string, verses?: VerseResult[]) => {
      await ensureActivePlan();
      await addItem(
        "scripture",
        reference,
        JSON.stringify({ reference, verses: verses ?? [] }),
      );
    },
    [addItem, ensureActivePlan],
  );

  // The sidebar is memoised; hand it a stable callback that reaches the current plan.
  const addToServiceRef = useRef(addToService);
  addToServiceRef.current = addToService;

  const handleAddToService = useCallback((reference: string, verses?: VerseResult[]) => {
    void addToServiceRef.current(reference, verses);
  }, []);

  const handlePreviewContextMenu = (event: MouseEvent) => {
    const selected = readPreviewTextSelection(previewRef.current);
    if (!selected) return;
    event.preventDefault();
    setHighlightMenu({ x: event.clientX, y: event.clientY, text: selected });
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={[
          "Bible",
          activePlan?.title ?? "Search",
          activeReference,
        ]}
        status={liveOnAir ? "live" : "ready"}
      />

      <div className="flex min-h-0 flex-1">
        <BibleSearchSidebar
          selectedVerseId={selectedVerseId}
          onSelectVerseIndex={handleSelectVerseIndex}
          onSelectSearchResult={handleSelectSearchResult}
          onAddToService={handleAddToService}
        />

        {/* Center — staging */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#06080d]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
            <div className="flex items-center gap-1">
              {viewTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setBibleViewMode(tab.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                    viewMode === tab.value
                      ? "bg-[var(--color-panel)] text-[var(--color-foreground)]"
                      : "text-[var(--color-subtle)] hover:text-[var(--color-muted-foreground)]",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide">{activeReferenceUpper}</span>
              <span
                className={cn(
                  "rounded-md bg-[var(--color-panel)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-subtle)]",
                  isDualTranslation && "text-[var(--color-primary)]",
                )}
              >
                {selectedAbbrLabel}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isCompare ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <TranslationCompare
                  reference={activeReference}
                  primaryTranslationId={resolvedTranslationIds[0] ?? selectedTranslationId}
                  secondaryTranslationId={secondaryTranslationId}
                  translations={translations}
                />
              </div>
            ) : viewMode === "reader" && (inChapterMode || selectedGroup) ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                  <p className="mb-3 text-sm font-semibold">{activeReferenceUpper}</p>
                  {(inChapterMode ? chapterVerses : selectedGroup ?? []).map((v) => (
                    <p
                      key={v.id}
                      className={cn(
                        "mb-3 rounded-md p-2 text-sm leading-relaxed",
                        inChapterMode && v.id === activeVerse?.id
                          ? "bg-blue-950/30 font-medium text-[var(--color-foreground)]"
                          : "text-[var(--color-muted-foreground)]",
                      )}
                    >
                      <span className="mr-2 font-bold text-[var(--color-subtle)]">[{v.verse}]</span>
                      {v.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <BibleStagingPanel
                  displayOptions={displayOptions}
                  themeOverride={isLowerThirdMode ? { lowerThird: effectiveLowerThird } : undefined}
                  isLowerThirdMode={isLowerThirdMode}
                  showLowerThirdSafeMargins={showLowerThirdSafeMargins}
                  lowerThirdChromaPreview={lowerThirdChromaPreview}
                  effectiveLowerThird={effectiveLowerThird}
                  innerRef={previewRef}
                  highlightMenu={highlightMenu}
                  onCloseHighlightMenu={() => setHighlightMenu(null)}
                  onHighlight={(text) => handleDisplayChange({ highlightPhrase: text })}
                  onContextMenu={handlePreviewContextMenu}
                />

                {/* Slides strip */}
                {slideGroups.length > 0 && (
                  <div className="shrink-0">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="section-label">Slides</p>
                      <button
                        type="button"
                        onClick={handleSplit}
                        className="flex items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2.5 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      >
                        <SplitSquareHorizontal className="h-3 w-3" />
                        Split
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {slideGroups.map((group, i) => (
                        <SlideThumbnail
                          key={i}
                          index={i}
                          group={group}
                          active={activeSlideIndexResolved === i}
                          onClick={() => goToSlide(i)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Format controls bar */}
                <div className="shrink-0 space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                  {isLowerThirdMode && (
                    <LowerThirdSettingsTrigger
                      effective={effectiveLowerThird}
                      onOpen={() => setLowerThirdSettingsOpen(true)}
                    />
                  )}
                  <FormatControls
                    options={displayOptions}
                    onChange={handleDisplayChange}
                    onExpandRange={expandVerseRange}
                    themeControlledFields={DEFAULT_THEME_FIELDS}
                  />
                </div>

                <p className="shrink-0 text-center text-[9px] leading-relaxed text-[var(--color-subtle)]">
                  Scripture quotations marked {selectedAbbrLabel} are from the licensed translation(s). © Bible Show Pro.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      <LowerThirdSettingsModal
        open={lowerThirdSettingsOpen}
        onClose={() => setLowerThirdSettingsOpen(false)}
        effective={effectiveLowerThird}
        state={lowerThirdSettings.controlState}
        onChange={lowerThirdSettings.onChange}
        onShowToggle={lowerThirdSettings.onShowToggle}
        showReference={displayOptions.showReference}
        showVersion={displayOptions.showVersion}
        showVerseNumbers={displayOptions.showVerseNumbers}
      />
    </div>
  );
}
