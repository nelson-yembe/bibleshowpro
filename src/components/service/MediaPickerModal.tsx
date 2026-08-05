import { useEffect, useState, type DragEvent } from "react";
import { Image, Search, Upload, Video, X } from "lucide-react";
import { MediaThumbnail } from "@/modules/media/MediaThumbnail";
import {
  isMediaDragEvent,
  pathsFromFileList,
  pickMediaFiles,
  type MediaPickKind,
} from "@/lib/importMedia";
import { api, type MediaRecord } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/mediaStore";
import { useToastStore } from "@/stores/toastStore";

interface MediaPickerModalProps {
  open: boolean;
  mediaType: "video" | "image";
  onClose: () => void;
  onSelect: (item: MediaRecord) => void;
}

export function MediaPickerModal({ open, mediaType, onClose, onSelect }: MediaPickerModalProps) {
  const importFiles = useMediaStore((s) => s.importFiles);
  const importing = useMediaStore((s) => s.importing);
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind: MediaPickKind = mediaType;

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await api.listMedia();
      setItems(all.filter((item) => item.media_type === mediaType));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load media library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDragOver(false);
      setError(null);
      return;
    }
    void reload();
  }, [open, mediaType]);

  if (!open) return null;

  const filtered = query.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
    : items;

  const Icon = mediaType === "video" ? Video : Image;
  const label = mediaType === "video" ? "video" : "image";

  const finishSelect = (item: MediaRecord) => {
    onSelect(item);
    onClose();
  };

  const importFromPaths = async (paths: string[]) => {
    if (paths.length === 0) {
      setError(`No valid ${label} files found. Check the file type and try again.`);
      return;
    }
    setError(null);
    try {
      const imported = await importFiles(paths);
      const matched = imported.filter((item) => item.media_type === mediaType);
      await reload();
      if (matched[0]) {
        useToastStore.getState().push({
          message:
            matched.length === 1
              ? `Imported “${matched[0].name}”`
              : `Imported ${matched.length} ${label}s`,
        });
        finishSelect(matched[0]);
        return;
      }
      setError(`Imported files, but none were ${label}s.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to import ${label}s`);
    }
  };

  const handleImportClick = async () => {
    const paths = await pickMediaFiles(kind);
    if (paths.length === 0) return;
    await importFromPaths(paths);
  };

  const handleDrop = async (event: DragEvent) => {
    if (!isMediaDragEvent(event)) return;
    event.preventDefault();
    setDragOver(false);
    const paths = pathsFromFileList(event.dataTransfer.files, kind);
    await importFromPaths(paths);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className={cn(
          "flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl",
          dragOver && "ring-2 ring-[var(--color-primary)]",
        )}
        onDragOver={(event) => {
          if (!isMediaDragEvent(event)) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4" />
            Choose {label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={() => void handleImportClick()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? "Importing…" : "Import from computer"}
            </button>
            <p className="text-[10px] text-[var(--color-subtle)]">
              Or drag {label}s here · multi-select supported
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label}s in library…`}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-7 pr-2 text-xs"
              autoFocus
            />
          </div>
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && <p className="px-2 py-6 text-center text-xs text-[var(--color-subtle)]">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={() => void handleImportClick()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border-light)] px-4 py-10 text-center hover:border-[var(--color-border)] hover:bg-[var(--color-panel)]"
            >
              <Upload className="h-6 w-6 text-[var(--color-subtle)]" />
              <p className="text-xs font-medium text-[var(--color-foreground)]">
                No {label}s in library yet
              </p>
              <p className="text-[11px] text-[var(--color-subtle)]">
                Import from your computer — files are copied into the Media library and linked here.
              </p>
              <span className="mt-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white">
                {importing ? "Importing…" : "Import from computer"}
              </span>
            </button>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((item) => (
                <MediaThumbnail
                  key={item.id}
                  item={item}
                  compact
                  onClick={() => finishSelect(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
