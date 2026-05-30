import { useEffect, useState } from "react";
import { Image, Search, Video, X } from "lucide-react";
import { api, type MediaRecord } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface MediaPickerModalProps {
  open: boolean;
  mediaType: "video" | "image";
  onClose: () => void;
  onSelect: (item: MediaRecord) => void;
}

export function MediaPickerModal({ open, mediaType, onClose, onSelect }: MediaPickerModalProps) {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .listMedia()
      .then((all) => setItems(all.filter((item) => item.media_type === mediaType)))
      .finally(() => setLoading(false));
  }, [open, mediaType]);

  if (!open) return null;

  const filtered = query.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  const Icon = mediaType === "video" ? Video : Image;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4" />
            Choose {mediaType}
          </h3>
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
              placeholder={`Search ${mediaType}s...`}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-7 pr-2 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <p className="px-2 py-4 text-center text-xs text-[var(--color-subtle)]">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[var(--color-subtle)]">
              No {mediaType}s in library. Import from Media first.
            </p>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-[var(--color-panel-hover)]",
                !item.file_exists && "opacity-60",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--color-subtle)]" />
              <span className="truncate text-sm">{item.name}</span>
              {!item.file_exists && (
                <span className="ml-auto text-[10px] text-amber-400">Missing</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
