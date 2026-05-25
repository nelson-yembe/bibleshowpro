import { useEffect, useRef } from "react";
import { Pin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VerseResult } from "@/lib/tauri";

interface ChapterResultsPanelProps {
  chapterLabel: string;
  verses: VerseResult[];
  activeVerseIndex: number;
  translationAbbr: string;
  highlightTerm?: string;
  onSelectVerse: (index: number) => void;
  onCopy?: (text: string) => void;
  onAddToService?: (verse: VerseResult) => void;
}

export function ChapterResultsPanel({
  chapterLabel,
  verses,
  activeVerseIndex,
  translationAbbr,
  highlightTerm,
  onSelectVerse,
  onAddToService,
}: ChapterResultsPanelProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeVerseIndex]);

  const highlightText = (text: string) => {
    const q = highlightTerm?.trim().toLowerCase();
    if (!q || q.includes(":")) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-blue-500/40 px-0.5 text-blue-200">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <div className="mb-2 px-1">
        <p className="text-[11px] font-semibold text-[var(--color-foreground)]">{chapterLabel}</p>
        <p className="text-[10px] text-[var(--color-subtle)]">
          {verses.length} verses · {translationAbbr}
        </p>
      </div>

      {verses.map((v, index) => {
        const isActive = index === activeVerseIndex;
        return (
          <button
            key={v.id}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSelectVerse(index)}
            className={cn(
              "mb-1 w-full rounded-lg border p-2.5 text-left transition-colors",
              isActive
                ? "border-[var(--color-primary)] bg-blue-950/50"
                : "border-transparent hover:bg-[var(--color-panel)]",
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
                <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {highlightText(v.text)}
                </p>
              </div>
              {isActive && (
                <div className="flex shrink-0 gap-1.5 pt-0.5 text-[var(--color-subtle)]">
                  <Pin className="h-3 w-3" />
                  <Plus
                    className="h-3 w-3 hover:text-[var(--color-primary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToService?.(v);
                    }}
                  />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
