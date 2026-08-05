import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { BIBLE_BOOKS, chapterOptions, verseOptions } from "@/lib/bibleBooks";

export interface PassagePickerProps {
  loading: boolean;
  lastError: string | null;
  /** Stable callback — parent should wrap with useRef to avoid re-renders. */
  onGoToPassage: (book: string, chapter: string, verse: string) => void;
}

/**
 * Self-contained book/chapter/verse picker. Kept isolated so live projection
 * updates elsewhere on the page do not re-render native <select> elements
 * (which would close an open dropdown and appear to flicker).
 */
export const PassagePicker = memo(function PassagePicker({
  loading,
  lastError,
  onGoToPassage,
}: PassagePickerProps) {
  const [book, setBook] = useState("John");
  const [chapter, setChapter] = useState("3");
  const [verse, setVerse] = useState("16");

  const chapters = useMemo(() => chapterOptions(book), [book]);
  const verses = useMemo(() => verseOptions(book, chapter), [book, chapter]);

  useEffect(() => {
    const maxCh = chapters.length;
    if (Number(chapter) > maxCh) setChapter("1");
  }, [book, chapters, chapter]);

  useEffect(() => {
    const maxVerse = verses.length;
    if (Number(verse) > maxVerse) setVerse(String(maxVerse || 1));
  }, [book, chapter, verses, verse]);

  const handleBookChange = useCallback((nextBook: string) => {
    setBook(nextBook);
    setChapter("1");
    setVerse("1");
  }, []);

  const handleGo = useCallback(() => {
    onGoToPassage(book, chapter, verse);
  }, [book, chapter, verse, onGoToPassage]);

  return (
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
        onClick={handleGo}
        disabled={loading}
        className="mt-2 h-8 w-full rounded-md bg-[var(--color-primary)] text-xs font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
      >
        {loading ? "Loading…" : "Go"}
      </button>
      {lastError && (
        <p className="mt-2 text-[10px] leading-snug text-amber-400/90">{lastError}</p>
      )}
    </div>
  );
});
