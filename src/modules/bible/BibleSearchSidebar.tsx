import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Search, X } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { ChapterResultsPanel } from "@/modules/bible/ChapterResultsPanel";
import { PassagePicker } from "@/modules/bible/PassagePicker";
import { cn } from "@/lib/utils";
import type { CatalogEntryView, VerseResult } from "@/lib/tauri";
import { useBibleStore } from "@/stores/bibleStore";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";

const MIN_INSTALLED_VERSES = 1000;

export interface BibleSearchSidebarProps {
  selectedVerseId: number | null;
  onVerseFound: (verse: VerseResult) => void;
  onSelectVerseIndex: (index: number) => void;
  onSelectSearchResult: (verse: VerseResult) => void;
  onAddToService: (reference: string, verses?: VerseResult[]) => void;
}

/**
 * Left search panel — intentionally does NOT subscribe to presentationStore so
 * live projection ticks cannot re-render native selects / scroll lists.
 */
export const BibleSearchSidebar = memo(function BibleSearchSidebar({
  selectedVerseId,
  onVerseFound,
  onSelectVerseIndex,
  onSelectSearchResult,
  onAddToService,
}: BibleSearchSidebarProps) {
  const query = useBibleStore((s) => s.query);
  const loading = useBibleStore((s) => s.loading);
  const lastError = useBibleStore((s) => s.lastError);
  const translations = useBibleStore((s) => s.translations);
  const selectedTranslationId = useBibleStore((s) => s.selectedTranslationId);
  const selectedTranslationIds = useBibleStore((s) => s.selectedTranslationIds);
  const groups = useBibleStore((s) => s.groups);
  const chapterVerses = useBibleStore((s) => s.chapterVerses);
  const chapterLabel = useBibleStore((s) => s.chapterLabel);
  const activeVerseIndex = useBibleStore((s) => s.activeVerseIndex);
  const setQuery = useBibleStore((s) => s.setQuery);
  const search = useBibleStore((s) => s.search);
  const toggleTranslationSelection = useBibleStore((s) => s.toggleTranslationSelection);

  const catalog = useBibleVersionsStore((s) => s.catalog);
  const loadCatalog = useBibleVersionsStore((s) => s.loadCatalog);

  const [exactPhrase, setExactPhrase] = useState(true);
  const [matchAllWords, setMatchAllWords] = useState(true);

  const searchOptions = useMemo(
    () => ({ exactPhrase, matchAllWords }),
    [exactPhrase, matchAllWords],
  );

  const selectedAbbr =
    translations.find((t) => t.id === selectedTranslationId)?.abbreviation ?? "ESV";

  const selectedAbbrLabel = useMemo(() => {
    const abbrs = selectedTranslationIds
      .map((id) => translations.find((t) => t.id === id)?.abbreviation)
      .filter(Boolean);
    return abbrs.length > 0 ? abbrs.join(" · ") : selectedAbbr;
  }, [selectedTranslationIds, translations, selectedAbbr]);

  const installedTranslations = useMemo((): CatalogEntryView[] => {
    const fromCatalog = catalog.filter(
      (entry) => entry.installed && entry.verse_count >= MIN_INSTALLED_VERSES,
    );
    if (fromCatalog.length > 0) return fromCatalog;

    return translations.map((t) => ({
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
  }, [catalog, translations]);

  const translationPills = useMemo((): CatalogEntryView[] => {
    const byId = new Map(installedTranslations.map((entry) => [entry.id, entry]));
    const visible: CatalogEntryView[] = [];
    const picked = new Set<string>();

    const add = (entry: CatalogEntryView | undefined) => {
      if (!entry || picked.has(entry.id)) return;
      picked.add(entry.id);
      visible.push(entry);
    };

    for (const id of selectedTranslationIds) {
      add(byId.get(id));
    }

    const remaining = [...installedTranslations].sort((a, b) =>
      a.abbreviation.localeCompare(b.abbreviation),
    );
    for (const entry of remaining) {
      add(entry);
    }

    return visible;
  }, [installedTranslations, selectedTranslationIds]);

  const availableVersionsCount = installedTranslations.length;
  const resultVerses = useMemo(() => groups.flat(), [groups]);
  const inChapterMode = chapterVerses.length > 0;
  const resultCount = inChapterMode ? chapterVerses.length : resultVerses.length;

  const runSearch = useCallback(
    async (q?: string) => {
      const ok = await search(q, searchOptions);
      const verse = useBibleStore.getState().getActiveVerse();
      if (verse) onVerseFound(verse);
      return ok;
    },
    [search, searchOptions, onVerseFound],
  );

  const handleSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  const handleGoToPassage = useCallback(
    (book: string, chapter: string, verse: string) => {
      const q = `${book} ${chapter}:${verse}`;
      setQuery(q);
      void runSearch(q);
    },
    [setQuery, runSearch],
  );

  useEffect(() => {
    void useBibleStore.getState().loadTranslations();
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadCatalog();
  }, [translations.length, loadCatalog]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.includes(":") || loading) return;
    void runSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-search when filters change
  }, [exactPhrase, matchAllWords]);

  const highlightQuery = useCallback(
    (text: string) => {
      const q = query.trim();
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
    },
    [query, exactPhrase],
  );

  const copyVerse = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[#0a0c12]">
      <div className="border-b border-[var(--color-border)] p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search words or passage (e.g. John 3:16)"
            className="h-9 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-8 pr-8 text-xs focus:border-[var(--color-primary)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <PassagePicker loading={loading} lastError={lastError} onGoToPassage={handleGoToPassage} />

      <div className="border-b border-[var(--color-border)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="section-label">Translation</p>
          <span className="text-[10px] text-[var(--color-subtle)]">
            {availableVersionsCount} version{availableVersionsCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mb-2 text-[10px] leading-snug text-[var(--color-subtle)]">
          Select up to 2 for side-by-side display. Click a selected pill again to remove it. Picking a
          third version replaces the compare slot (e.g. KJV+AMP then NIV → AMP+NIV).
        </p>
        <div className="flex flex-wrap gap-1">
          {translationPills.map((entry) => {
            const slot = selectedTranslationIds.indexOf(entry.id);
            const active = slot >= 0;
            const slotLabel = slot === 0 ? "1" : slot === 1 ? "2" : null;
            return (
              <Pill
                key={entry.id}
                active={active}
                onClick={() => toggleTranslationSelection(entry.id)}
                className={cn(active && slot === 1 && "ring-1 ring-[var(--color-primary)]/50")}
                title={
                  `${entry.name}${slotLabel ? ` (${slotLabel === "1" ? "primary" : "compare"})` : ""}`
                }
              >
                {slotLabel ? `${entry.abbreviation} ${slotLabel}` : entry.abbreviation}
              </Pill>
            );
          })}
        </div>
        {availableVersionsCount === 0 && (
          <p className="mt-2 text-[10px] text-[var(--color-subtle)]">
            No Bible versions installed yet. Download or import one in Settings.
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
          {inChapterMode ? "Chapter" : "Results"} · {resultCount > 0 ? resultCount : loading ? "…" : 0}
        </p>
        {inChapterMode && chapterLabel && (
          <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
            {chapterLabel} · verse {activeVerseIndex + 1} of {chapterVerses.length} · {selectedAbbrLabel}
          </p>
        )}
        {!inChapterMode && resultCount > 0 && (
          <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
            for &ldquo;{query.includes(":") ? "passage" : query}&rdquo; in {selectedAbbrLabel}
          </p>
        )}
      </div>

      {inChapterMode && chapterLabel ? (
        <ChapterResultsPanel
          chapterLabel={chapterLabel}
          verses={chapterVerses}
          activeVerseIndex={activeVerseIndex}
          translationAbbr={selectedAbbr}
          highlightTerm={query.includes(":") ? undefined : query}
          onSelectVerse={onSelectVerseIndex}
          onCopy={copyVerse}
          onAddToService={(v) => {
            void onAddToService(v.reference, [v]);
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
                onClick={() => void onSelectSearchResult(v)}
                className={cn(
                  "mb-1.5 w-full rounded-lg border p-2.5 text-left transition-colors",
                  isSelected
                    ? "border-[var(--color-primary)] bg-blue-950/30"
                    : "border-[var(--color-border-light)]/50 hover:bg-[var(--color-panel)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-semibold">{v.reference}</span>
                      <span className="rounded bg-[var(--color-panel-hover)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-subtle)]">
                        {v.translation_abbr}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5 pt-0.5 text-[var(--color-subtle)]">
                    <button
                      type="button"
                      title="Add to service plan"
                      className="text-[var(--color-subtle)] hover:text-[var(--color-primary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onAddToService(v.reference, [v]);
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
  );
});
