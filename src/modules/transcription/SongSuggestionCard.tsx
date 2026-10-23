import { Music, X } from "lucide-react";
import { useSongFollowStore } from "@/stores/songFollowStore";

/** "Sounds like Amazing Grace": a song heard in the transcript, one click from preview. */
export function SongSuggestionCard() {
  const suggestion = useSongFollowStore((s) => s.suggestion);
  const accept = useSongFollowStore((s) => s.accept);
  const dismiss = useSongFollowStore((s) => s.dismiss);
  if (!suggestion) return null;

  return (
    <article className="rounded-lg border border-violet-400/40 bg-violet-950/20 p-3">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-violet-200/80">
            <Music className="h-3 w-3" />
            Sounds like a song
          </p>
          <h3 className="truncate text-sm font-semibold text-[var(--color-foreground)]">{suggestion.title}</h3>
          {suggestion.sectionLabel && (
            <p className="text-[10px] text-[var(--color-muted-foreground)]">{suggestion.sectionLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
          title="Not this song"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mb-2 line-clamp-2 text-[11px] italic text-[var(--color-muted-foreground)]">“{suggestion.line}”</p>
      <button
        type="button"
        onClick={() => void accept()}
        className="rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-500"
      >
        Preview this song
      </button>
    </article>
  );
}
