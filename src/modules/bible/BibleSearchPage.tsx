import { StagingPreview } from "@/components/presentation/StagingPreview";
import { FormatControls, DEFAULT_THEME_FIELDS } from "@/components/presentation/FormatControls";
import {
  PreviewHighlightMenu,
  readPreviewTextSelection,
  type HighlightMenuState,
} from "@/components/presentation/PreviewHighlightMenu";
import { SlideThumbnail } from "@/components/presentation/SlideThumbnail";
import {
  buildDisplayOptions,
  defaultLocalDisplayOverrides,
  type LocalDisplayOverrides,
} from "@/components/presentation/displayOptions";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import { TopBar } from "@/components/layout/TopBar";
import { Pill } from "@/components/ui/pill";
import { TranslationCompare } from "@/modules/bible/TranslationCompare";
import { ChapterResultsPanel } from "@/modules/bible/ChapterResultsPanel";
import { LowerThirdControls } from "@/components/presentation/LowerThirdControls";
import { ChromaPreviewGrid, SafeMarginOverlay } from "@/components/presentation/SafeMarginOverlay";
import { mergeLowerThirdTheme } from "@/lib/lowerThird";
import type { LowerThirdOverrides } from "@/lib/lowerThird";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Plus,
  Search,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import { useBibleStore } from "@/stores/bibleStore";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { useLiveDisplayStore } from "@/stores/liveDisplayStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useThemeStore } from "@/stores/themeStore";
import type { CatalogEntryView, VerseResult } from "@/lib/tauri";
import { BIBLE_BOOKS, chapterOptions, verseOptions } from "@/lib/bibleBooks";
import { lookupVerseInTranslation } from "@/lib/bibleCompare";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";
import type { VerseLayout } from "@/engine/scene";

const viewTabs = [
  { value: "fullscreen", label: "Fullscreen" },
  { value: "lower_third", label: "Lower Third" },
  { value: "compare", label: "Compare" },
  { value: "reader", label: "Reader" },
];

const MAX_TRANSLATION_PILLS = 6;

export function BibleSearchPage() {
  const bible = useBibleStore();
  const catalog = useBibleVersionsStore((s) => s.catalog);
  const loadCatalog = useBibleVersionsStore((s) => s.loadCatalog);
  const { showVerses, showVerseComparison, preview, program, liveFollow } = usePresentationStore();
  const { activePlan, addItem, createPlan } = useServiceStore();
  const activeTheme = useThemeStore((s) => s.activeTheme);
  const themeRevision = useThemeStore((s) => s.themeRevision);
  const applyThemeLive = useThemeStore((s) => s.applyThemeLive);

  const [viewMode, setViewMode] = useState("fullscreen");
  const [selectedGroup, setSelectedGroup] = useState<VerseResult[] | null>(null);
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null);
  const [book, setBook] = useState("John");
  const [chapter, setChapter] = useState("3");
  const [verse, setVerse] = useState("16");
  const [exactPhrase, setExactPhrase] = useState(true);
  const [matchAllWords, setMatchAllWords] = useState(true);
  const [localDisplay, setLocalDisplay] = useState<LocalDisplayOverrides>(defaultLocalDisplayOverrides);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const [highlightMenu, setHighlightMenu] = useState<HighlightMenuState | null>(null);

  /** Typography comes from Themes; Bible Search only keeps verse/session overrides */
  const effectiveTheme = useMemo(
    () =>
      mergeLowerThirdTheme(activeTheme, {
        ...localDisplay.lowerThird,
        ...(viewMode === "lower_third" ? { enabled: true } : {}),
      }),
    [activeTheme, themeRevision, localDisplay.lowerThird, viewMode],
  );

  const displayOptions = useMemo(
    () => buildDisplayOptions(effectiveTheme, localDisplay),
    [effectiveTheme, localDisplay],
  );

  const effectiveLowerThird = effectiveTheme.lowerThird;
  const isLowerThirdMode = viewMode === "lower_third";

  const handleLowerThirdChange = useCallback((patch: Record<string, unknown>) => {
    setLocalDisplay((prev) => {
      const next = { ...prev };
      if (patch.showLowerThirdSafeMargins !== undefined) {
        next.showLowerThirdSafeMargins = patch.showLowerThirdSafeMargins as boolean;
      }
      if (patch.lowerThirdChromaPreview !== undefined) {
        next.lowerThirdChromaPreview = patch.lowerThirdChromaPreview as boolean;
      }
      const ltPatch = (patch.lowerThird as LowerThirdOverrides | undefined) ?? {};
      const directLt: LowerThirdOverrides = {};
      for (const [key, value] of Object.entries(patch)) {
        if (
          key !== "lowerThird" &&
          key !== "showLowerThirdSafeMargins" &&
          key !== "lowerThirdChromaPreview" &&
          value !== undefined
        ) {
          (directLt as Record<string, unknown>)[key] = value;
        }
      }
      const mergedLt = { ...(prev.lowerThird ?? {}), ...ltPatch, ...directLt };
      if (Object.keys(mergedLt).length > 0) {
        next.lowerThird = mergedLt;
      }
      return next;
    });
  }, []);

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
  }, []);

  const chapters = useMemo(() => chapterOptions(book), [book]);
  const verses = useMemo(() => verseOptions(book, chapter), [book, chapter]);
  const verseLayout = viewMode === "lower_third" ? "lower_third" : "fullscreen";

  const selectedTranslationIds = useMemo(() => {
    if (bible.selectedTranslationIds.length > 0) return bible.selectedTranslationIds;
    return bible.selectedTranslationId ? [bible.selectedTranslationId] : [];
  }, [bible.selectedTranslationIds, bible.selectedTranslationId]);

  const presentActiveVerse = useCallback(
    async (verse: VerseResult, layoutOverride?: VerseLayout) => {
      const layout = layoutOverride ?? verseLayout;
      const ids =
        useBibleStore.getState().selectedTranslationIds.length > 0
          ? useBibleStore.getState().selectedTranslationIds
          : useBibleStore.getState().selectedTranslationId
            ? [useBibleStore.getState().selectedTranslationId!]
            : [];

      if (ids.length >= 2) {
        const secondary = await lookupVerseInTranslation(verse, ids[1]);
        if (secondary) {
          showVerseComparison(verse, secondary, effectiveTheme, layout);
          return;
        }
      }
      showVerses([verse], effectiveTheme, layout);
    },
    [showVerses, showVerseComparison, effectiveTheme, verseLayout],
  );

  useEffect(() => {
    if (!isLowerThirdMode) return;
    const active = useBibleStore.getState().getActiveVerse();
    if (active) void presentActiveVerse(active);
  }, [localDisplay.lowerThird, isLowerThirdMode, presentActiveVerse]);

  useEffect(() => {
    const active = useBibleStore.getState().getActiveVerse();
    if (active) void presentActiveVerse(active);
  }, [viewMode, effectiveTheme, themeRevision, presentActiveVerse]);

  useEffect(() => {
    const active = useBibleStore.getState().getActiveVerse();
    if (active) void presentActiveVerse(active);
  }, [selectedTranslationIds.join(","), presentActiveVerse]);

  useEffect(() => {
    void useBibleStore.getState().loadTranslations();
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const maxCh = chapters.length;
    if (Number(chapter) > maxCh) setChapter("1");
  }, [book, chapters, chapter]);

  useEffect(() => {
    const maxVerse = verses.length;
    if (Number(verse) > maxVerse) setVerse(String(maxVerse || 1));
  }, [book, chapter, verses, verse]);

  const sendToPreview = useCallback(
    async (verse: VerseResult) => {
      await bible.loadChapterForVerse(verse);
      const index = useBibleStore.getState().activeVerseIndex;
      const active = useBibleStore.getState().chapterVerses[index] ?? verse;
      setSelectedGroup([active]);
      setSelectedVerseId(active.id);
      setActiveSlideIndex(index);
      setLocalDisplay((o) => ({
        ...o,
        verseStart: String(active.verse),
        verseEnd: String(active.verse),
      }));
      await presentActiveVerse(active);
    },
    [bible, presentActiveVerse],
  );

  const goToVerseIndex = useCallback(
    (index: number) => {
      const verses = useBibleStore.getState().chapterVerses;
      if (index < 0 || index >= verses.length) return;
      bible.setActiveVerseIndex(index);
      const active = verses[index];
      setSelectedGroup([active]);
      setSelectedVerseId(active.id);
      setActiveSlideIndex(index);
      setLocalDisplay((o) => ({
        ...o,
        verseStart: String(active.verse),
        verseEnd: String(active.verse),
      }));
      void presentActiveVerse(active);
    },
    [bible, presentActiveVerse],
  );

  const goToAdjacentVerse = useCallback(
    (delta: number) => {
      const { chapterVerses, activeVerseIndex, groups } = useBibleStore.getState();
      if (chapterVerses.length > 0) {
        goToVerseIndex(activeVerseIndex + delta);
        return;
      }

      const groupsList =
        groups.length > 0 ? groups : selectedGroup ? [selectedGroup] : [];
      const nextIndex = activeSlideIndex + delta;
      if (nextIndex < 0 || nextIndex >= groupsList.length) return;
      const group = groupsList[nextIndex];
      if (!group?.[0]) return;
      void sendToPreview(group[0]);
      setActiveSlideIndex(nextIndex);
    },
    [goToVerseIndex, sendToPreview, selectedGroup, activeSlideIndex],
  );

  const selectedAbbr =
    bible.translations.find((t) => t.id === bible.selectedTranslationId)?.abbreviation ?? "ESV";

  const selectedAbbrLabel = useMemo(() => {
    const abbrs = selectedTranslationIds
      .map((id) => bible.translations.find((t) => t.id === id)?.abbreviation)
      .filter(Boolean);
    return abbrs.length > 0 ? abbrs.join(" · ") : selectedAbbr;
  }, [selectedTranslationIds, bible.translations, selectedAbbr]);

  const secondaryTranslationId = selectedTranslationIds[1];
  const isDualTranslation = selectedTranslationIds.length >= 2;

  const availableAbbrs = useMemo(
    () =>
      new Set(
        bible.translations
          .filter((t) => {
            const cat = catalog.find((c) => c.id === t.id);
            return !cat || cat.verse_count >= 1000;
          })
          .map((t) => t.abbreviation.toUpperCase()),
      ),
    [bible.translations, catalog],
  );

  const translationPills = useMemo((): CatalogEntryView[] => {
    const all: CatalogEntryView[] =
      catalog.length > 0
        ? catalog
        : bible.translations.map((t) => ({
            id: t.id,
            abbreviation: t.abbreviation,
            name: t.name,
            language: t.language,
            copyright: "",
            license: "",
            source_format: "",
            is_default: t.is_default,
            installed: true,
            verse_count: 1,
            install_method: "download",
          }));

    const picked = new Set<string>();
    const visible: CatalogEntryView[] = [];

    const add = (entry: CatalogEntryView) => {
      if (visible.length >= MAX_TRANSLATION_PILLS || picked.has(entry.id)) return;
      picked.add(entry.id);
      visible.push(entry);
    };

    for (const id of selectedTranslationIds) {
      const entry = all.find((e) => e.id === id);
      if (entry) add(entry);
    }

    for (const entry of all) {
      if (availableAbbrs.has(entry.abbreviation.toUpperCase())) add(entry);
    }

    for (const entry of all) {
      add(entry);
    }

    return visible;
  }, [catalog, bible.translations, selectedTranslationIds, availableAbbrs]);

  const hasMoreTranslations = useMemo(() => {
    const total = catalog.length > 0 ? catalog.length : bible.translations.length;
    return total > MAX_TRANSLATION_PILLS;
  }, [catalog.length, bible.translations.length]);

  const searchOptions = useMemo(
    () => ({ exactPhrase, matchAllWords }),
    [exactPhrase, matchAllWords],
  );

  const resultVerses = useMemo(() => bible.groups.flat(), [bible.groups]);

  const inChapterMode = bible.chapterVerses.length > 0;
  const resultCount = inChapterMode ? bible.chapterVerses.length : resultVerses.length;

  const runSearch = async (q?: string) => {
    const ok = await bible.search(q, searchOptions);
    const verse = useBibleStore.getState().getActiveVerse();
    if (verse) {
      setSelectedGroup([verse]);
      setSelectedVerseId(verse.id);
      setActiveSlideIndex(useBibleStore.getState().activeVerseIndex);
      setLocalDisplay((o) => ({
        ...o,
        verseStart: String(verse.verse),
        verseEnd: String(verse.verse),
      }));
      void presentActiveVerse(verse);
    }
    return ok;
  };

  const handleSearch = () => void runSearch();

  const handleGoToPassage = () => {
    const q = `${book} ${chapter}:${verse}`;
    bible.setQuery(q);
    void runSearch(q);
  };

  const handleBookChange = (nextBook: string) => {
    setBook(nextBook);
    setChapter("1");
    setVerse("1");
  };

  useEffect(() => {
    const q = bible.query.trim();
    if (!q || q.includes(":") || bible.loading) return;
    void runSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search when filters change
  }, [exactPhrase, matchAllWords]);

  const highlightQuery = (text: string) => {
    const q = bible.query.trim();
    if (!q || q.includes(":")) return text;

    const lowerText = text.toLowerCase();
    type Span = { start: number; end: number };
    const spans: Span[] = [];

    const addSpan = (start: number, end: number) => {
      if (start >= 0 && end > start) spans.push({ start, end });
    };

    if (exactPhrase) {
      const phrase = q.replace(/^["']|["']$/g, "");
      const idx = lowerText.indexOf(phrase.toLowerCase());
      if (idx !== -1) addSpan(idx, idx + phrase.length);
    } else {
      const words = q.split(/\s+/).filter(Boolean);
      for (const word of words) {
        let from = 0;
        const needle = word.toLowerCase();
        while (from < lowerText.length) {
          const idx = lowerText.indexOf(needle, from);
          if (idx === -1) break;
          addSpan(idx, idx + word.length);
          from = idx + needle.length;
        }
      }
    }

    if (spans.length === 0) return text;

    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: Span[] = [];
    for (const span of spans) {
      const last = merged[merged.length - 1];
      if (!last || span.start > last.end) {
        merged.push({ ...span });
      } else if (span.end > last.end) {
        last.end = span.end;
      }
    }

    const parts: ReactNode[] = [];
    let cursor = 0;
    merged.forEach((span, i) => {
      if (cursor < span.start) parts.push(text.slice(cursor, span.start));
      parts.push(
        <mark key={`${span.start}-${i}`} className="rounded bg-blue-500/30 px-0.5 text-blue-200">
          {text.slice(span.start, span.end)}
        </mark>,
      );
      cursor = span.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return <>{parts}</>;
  };

  const isBlackout = program?.type === "blackout";
  const isCompare = viewMode === "compare";
  const slideGroups = inChapterMode
    ? bible.chapterVerses.map((v) => [v])
    : bible.groups.length > 0
      ? bible.groups
      : selectedGroup
        ? [selectedGroup]
        : [];
  const activeVerse = bible.getActiveVerse() ?? selectedGroup?.[0] ?? null;
  const activeReference = activeVerse?.reference ?? preview?.content.reference ?? "Select a passage";
  const activeReferenceUpper = activeReference.toUpperCase();
  const activeSlideIndexResolved = inChapterMode ? bible.activeVerseIndex : activeSlideIndex;
  const navigableLength = inChapterMode ? bible.chapterVerses.length : slideGroups.length;
  const navigableIndex = activeSlideIndexResolved;

  useEffect(() => {
    useLiveDisplayStore.getState().setDisplayOptions(displayOptions);
    return () => useLiveDisplayStore.getState().setDisplayOptions(undefined);
  }, [displayOptions]);

  useEffect(() => {
    useLiveNavigationStore.getState().register({
      onPrev: () => goToAdjacentVerse(-1),
      onNext: () => goToAdjacentVerse(1),
      canPrev: navigableLength > 0 && navigableIndex > 0,
      canNext: navigableLength > 0 && navigableIndex < navigableLength - 1,
      label: "Bible slides",
      beforeGoLive: async () => {
        const active = useBibleStore.getState().getActiveVerse();
        if (active) await presentActiveVerse(active);
      },
    });
    return () => useLiveNavigationStore.getState().unregister();
  }, [goToAdjacentVerse, navigableLength, navigableIndex, presentActiveVerse]);

  const goToSlide = (index: number) => {
    if (inChapterMode) {
      goToVerseIndex(index);
      return;
    }
    const group = slideGroups[index];
    if (!group?.[0]) return;
    void sendToPreview(group[0]);
    setActiveSlideIndex(index);
  };

  const handleSplit = () => {
    if (!selectedGroup?.[0]) return;
    const ref = selectedGroup[0];
    const q = `${ref.book_name} ${ref.chapter}:${displayOptions.verseStart}-${displayOptions.verseEnd}`;
    bible.setQuery(q);
    void runSearch(q);
  };

  const expandVerseRange = () => {
    const end = Number(displayOptions.verseEnd);
    if (Number.isNaN(end)) return;
    setLocalDisplay((o) => ({ ...o, verseEnd: String(end + 1) }));
  };

  const copyVerse = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  const handlePreviewContextMenu = (event: MouseEvent) => {
    const selected = readPreviewTextSelection(previewRef.current);
    if (!selected) return;
    event.preventDefault();
    setHighlightMenu({ x: event.clientX, y: event.clientY, text: selected });
  };

  const toggleTranslationPill = (translationId: string) => {
    bible.toggleTranslationSelection(translationId);
  };

  const addToService = useCallback(
    async (reference: string, verses?: VerseResult[]) => {
      if (!useServiceStore.getState().activePlan) {
        await createPlan("Quick service");
      }
      await addItem(
        "scripture",
        reference,
        JSON.stringify({ reference, verses: verses ?? [] }),
      );
    },
    [addItem, createPlan],
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={[
          "Bible",
          activePlan?.title ?? "Search",
          activeReference,
        ]}
        status={liveFollow && program && !isBlackout ? "live" : "ready"}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left — Search */}
        <aside className="flex w-[272px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[#0a0c12]">
          <div className="border-b border-[var(--color-border)] p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
              <input
                value={bible.query}
                onChange={(e) => bible.setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search words or passage (e.g. John 3:16)"
                className="h-9 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-8 pr-8 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              />
              {bible.query && (
                <button
                  type="button"
                  onClick={() => bible.setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Go to passage</p>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <p className="mb-1 text-[9px] text-[var(--color-subtle)]">Book</p>
                <select
                  value={book}
                  onChange={(e) => handleBookChange(e.target.value)}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                >
                  {BIBLE_BOOKS.map((b) => (
                    <option key={b.number} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[9px] text-[var(--color-subtle)]">Ch</p>
                <select
                  value={chapter}
                  onChange={(e) => {
                    setChapter(e.target.value);
                    setVerse("1");
                  }}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-1 text-center text-xs"
                >
                  {chapters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[9px] text-[var(--color-subtle)]">V</p>
                <select
                  value={verse}
                  onChange={(e) => setVerse(e.target.value)}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-1 text-center text-xs"
                >
                  {verses.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoToPassage}
              disabled={bible.loading}
              className="mt-2 h-8 w-full rounded-md bg-[var(--color-primary)] text-xs font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
            >
              {bible.loading ? "Loading…" : "Go"}
            </button>
            {bible.lastError && (
              <p className="mt-2 text-[10px] leading-snug text-amber-400/90">{bible.lastError}</p>
            )}
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Translation</p>
            <p className="mb-2 text-[10px] leading-snug text-[var(--color-subtle)]">
              Select up to 2 for side-by-side display.
            </p>
            <div className="flex flex-wrap gap-1">
              {translationPills.map((entry) => {
                const available = availableAbbrs.has(entry.abbreviation.toUpperCase());
                const slot = selectedTranslationIds.indexOf(entry.id);
                const active = slot >= 0;
                const slotLabel = slot === 0 ? "1" : slot === 1 ? "2" : null;
                return (
                  <Pill
                    key={entry.id}
                    active={active}
                    onClick={() => available && toggleTranslationPill(entry.id)}
                    className={cn(
                      !available && "cursor-not-allowed opacity-40",
                      active && slot === 1 && "ring-1 ring-[var(--color-primary)]/50",
                    )}
                    title={
                      available
                        ? `${entry.name}${slotLabel ? ` (${slotLabel === "1" ? "primary" : "compare"})` : ""}`
                        : entry.install_method === "import"
                          ? `${entry.abbreviation} — import in Settings`
                          : `${entry.abbreviation} — download in Settings`
                    }
                  >
                    {slotLabel ? `${entry.abbreviation} ${slotLabel}` : entry.abbreviation}
                  </Pill>
                );
              })}
            </div>
            {hasMoreTranslations && (
              <p className="mt-2 text-[10px] text-[var(--color-subtle)]">
                Showing {MAX_TRANSLATION_PILLS} of {catalog.length || bible.translations.length}. Manage all
                translations in Settings.
              </p>
            )}
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Search options</p>
            <label className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={exactPhrase}
                onChange={(e) => setExactPhrase(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Exact phrase
            </label>
            <label className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
              <input
                type="checkbox"
                checked={matchAllWords}
                onChange={(e) => setMatchAllWords(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              Match all words
            </label>
          </div>

          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <p className="section-label">
              {inChapterMode ? "Chapter" : "Results"} · {resultCount > 0 ? resultCount : bible.loading ? "…" : 0}
            </p>
            {inChapterMode && bible.chapterLabel && (
              <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
                {bible.chapterLabel} · verse {bible.activeVerseIndex + 1} of {bible.chapterVerses.length} · {selectedAbbrLabel}
              </p>
            )}
            {!inChapterMode && resultCount > 0 && (
              <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
                for &ldquo;{bible.query.includes(":") ? "passage" : bible.query}&rdquo; in {selectedAbbrLabel}
              </p>
            )}
          </div>

          {inChapterMode && bible.chapterLabel ? (
            <ChapterResultsPanel
              chapterLabel={bible.chapterLabel}
              verses={bible.chapterVerses}
              activeVerseIndex={bible.activeVerseIndex}
              translationAbbr={selectedAbbr}
              highlightTerm={bible.query.includes(":") ? undefined : bible.query}
              onSelectVerse={goToVerseIndex}
              onCopy={copyVerse}
              onAddToService={(v) => {
                void addToService(v.reference, [v]);
              }}
            />
          ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {resultVerses.map((v) => {
              const isSelected = selectedVerseId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => void sendToPreview(v)}
                  className={cn(
                    "mb-1.5 w-full rounded-lg border p-2.5 text-left transition-colors",
                    isSelected
                      ? "border-[var(--color-primary)] bg-blue-950/30"
                      : "border-[var(--color-border-light)]/50 hover:bg-[var(--color-panel)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{v.reference}</span>
                      <span className="rounded bg-[var(--color-panel-hover)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-subtle)]">
                        {v.translation_abbr}
                      </span>
                    </div>
                    <div className="flex shrink-0 text-[var(--color-subtle)]">
                      <button
                        type="button"
                        title="Add to service plan"
                        className="text-[var(--color-subtle)] hover:text-[var(--color-primary)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          void addToService(v.reference, [v]);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                    <span className="mr-1 text-[var(--color-subtle)]">[{v.verse}]</span>
                    {highlightQuery(v.text)}
                  </p>
                  <p className="mt-2 text-center text-[10px] font-medium text-[var(--color-subtle)]">{v.translation_abbr}</p>
                </button>
              );
            })}
          </div>
          )}
        </aside>

        {/* Center — staging */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#06080d]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
            <div className="flex items-center gap-1">
              {viewTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setViewMode(tab.value);
                    const active = useBibleStore.getState().getActiveVerse();
                    if (active) {
                      void presentActiveVerse(
                        active,
                        tab.value === "lower_third" ? "lower_third" : "fullscreen",
                      );
                    }
                  }}
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
                  primaryTranslationId={selectedTranslationIds[0] ?? bible.selectedTranslationId}
                  secondaryTranslationId={secondaryTranslationId}
                  translations={bible.translations}
                />
              </div>
            ) : viewMode === "reader" && (inChapterMode || selectedGroup) ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                  <p className="mb-3 text-sm font-semibold">{activeReferenceUpper}</p>
                  {(inChapterMode ? bible.chapterVerses : selectedGroup ?? []).map((v) => (
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
                <StagingPreview
                  scene={preview}
                  displayOptions={displayOptions}
                  themeOverride={isLowerThirdMode ? { lowerThird: effectiveLowerThird } : undefined}
                  label="Preview a passage — GO LIVE on the right panel"
                  innerRef={previewRef}
                  onContextMenu={handlePreviewContextMenu}
                  isBlackout={isBlackout}
                >
                  {isLowerThirdMode && localDisplay.lowerThirdChromaPreview !== false && effectiveLowerThird.transparentOutput && (
                    <ChromaPreviewGrid />
                  )}
                  {isLowerThirdMode && localDisplay.showLowerThirdSafeMargins && (
                    <SafeMarginOverlay marginPercent={effectiveLowerThird.safeMarginPercent} />
                  )}
                  <PreviewHighlightMenu
                    menu={highlightMenu}
                    onClose={() => setHighlightMenu(null)}
                    onHighlight={(text) => handleDisplayChange({ highlightPhrase: text })}
                  />
                  <div className="pointer-events-none absolute left-3 top-3">
                    {liveFollow && program && !isBlackout ? <span className="live-badge">● ● ON AIR</span> : null}
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 text-[10px] text-[var(--color-subtle)]">
                    1920 × 1080 · 30 fps
                  </div>
                </StagingPreview>

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
                    <LowerThirdControls
                      effective={effectiveLowerThird}
                      state={localDisplay}
                      onChange={handleLowerThirdChange}
                      onShowToggle={(patch) => applyThemeLive({ ...activeTheme, ...patch })}
                      showReference={displayOptions.showReference}
                      showVersion={displayOptions.showVersion}
                      showVerseNumbers={displayOptions.showVerseNumbers}
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
    </div>
  );
}
