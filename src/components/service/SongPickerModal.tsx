import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/tauri";
import type { SongSummary } from "@/lib/songTypes";

interface SongPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (song: SongSummary) => void;
}

export function SongPickerModal({ open, onClose, onSelect }: SongPickerModalProps) {
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .listSongs(undefined, query || undefined)
      .then(setSongs)
      .finally(() => setLoading(false));
  }, [open, query]);

  if (!open) return null;

  const filtered = query.trim()
    ? songs.filter(
        (song) =>
          song.title.toLowerCase().includes(query.toLowerCase()) ||
          (song.artist ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : songs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-semibold">Choose a song</h3>
          <button type="button" onClick={onClose} className="text-[var(--color-subtle)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-[var(--color-border)] px-4 py-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs..."
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-7 pr-2 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <p className="px-2 py-4 text-center text-xs text-[var(--color-subtle)]">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[var(--color-subtle)]">No songs found</p>
          )}
          {filtered.map((song) => (
            <button
              key={song.id}
              type="button"
              onClick={() => {
                onSelect(song);
                onClose();
              }}
              className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-[var(--color-panel-hover)]"
            >
              <span className="truncate text-sm font-medium">{song.title}</span>
              {song.artist && <span className="truncate text-[11px] text-[var(--color-subtle)]">{song.artist}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
