import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Search, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/pill";
import { pickMediaFiles, isMediaDragEvent } from "@/lib/importMedia";
import { parseMediaTags } from "@/lib/mediaUrl";
import { cn } from "@/lib/utils";
import { MediaPreview, MediaThumbnail } from "@/modules/media/MediaThumbnail";
import { useMediaStore, type MediaFilter } from "@/stores/mediaStore";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";

const sidebarFilters: { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All media" },
  { id: "recent", label: "Recent" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "missing", label: "Missing files" },
];

export function MediaLibraryPage() {
  const store = useMediaStore();
  const program = usePresentationStore((s) => s.program);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const activePlan = useServiceStore((s) => s.activePlan);

  const [tagInput, setTagInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void store.init();
  }, [store.init]);

  const filtered = store.filteredItems();
  const mediaIndex = filtered.findIndex((item) => item.id === store.selectedId);

  useEffect(() => {
    useLiveNavigationStore.getState().register({
      onPrev: () => {
        const items = useMediaStore.getState().filteredItems();
        const index = items.findIndex((item) => item.id === useMediaStore.getState().selectedId);
        if (index > 0) void useMediaStore.getState().selectItem(items[index - 1]!.id);
      },
      onNext: () => {
        const items = useMediaStore.getState().filteredItems();
        const index = items.findIndex((item) => item.id === useMediaStore.getState().selectedId);
        if (index >= 0 && index < items.length - 1) void useMediaStore.getState().selectItem(items[index + 1]!.id);
      },
      canPrev: mediaIndex > 0,
      canNext: mediaIndex >= 0 && mediaIndex < filtered.length - 1,
      label: "Media library",
      beforeGoLive: async () => {
        const item = useMediaStore.getState().selectedItem();
        if (item) {
          const { previewMediaItem } = await import("@/lib/mediaLive");
          const { useThemeStore } = await import("@/stores/themeStore");
          await previewMediaItem(item, useThemeStore.getState().activeTheme);
        }
      },
    });
    return () => useLiveNavigationStore.getState().unregister();
  }, [mediaIndex, filtered.length]);

  const selected = store.selectedItem();
  const missingCount = store.items.filter((item) => !item.file_exists).length;
  const isLive = liveFollow && program && program.type !== "blackout";
  const selectedTags = selected ? parseMediaTags(selected.tags_json) : [];

  const typeCounts = useMemo(() => {
    return store.items.reduce(
      (acc, item) => {
        acc[item.media_type] = (acc[item.media_type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [store.items]);

  const handleImport = useCallback(async () => {
    const paths = await pickMediaFiles();
    if (paths.length > 0) await store.importFiles(paths);
  }, [store]);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const paths = Array.from(event.dataTransfer.files).map((file) => {
        const withPath = file as File & { path?: string };
        return withPath.path ?? file.name;
      });
      if (paths.length > 0) await store.importFiles(paths);
    },
    [store],
  );

  const addTag = () => {
    if (!selected || !tagInput.trim()) return;
    const next = [...new Set([...selectedTags, tagInput.trim().toLowerCase()])];
    void store.updateItem(selected.id, { tags: next });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    if (!selected) return;
    void store.updateItem(selected.id, { tags: selectedTags.filter((entry) => entry !== tag) });
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={["Media", "Library", selected?.name ?? "Browse"]}
        status={isLive ? "live" : "ready"}
        actions={
          <div className="flex items-center gap-2">
            {store.importing ? (
              <StatusBadge variant="draft">Importing…</StatusBadge>
            ) : (
              <StatusBadge variant="saved">● Synced</StatusBadge>
            )}
            <button
              type="button"
              onClick={() => void handleImport()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Upload className="h-3.5 w-3.5" />
              Import files
            </button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] p-3">
            <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
              Import images, videos, and audio. Preview and go live from here, or add items to your service plan.
            </p>
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Library</p>
            {sidebarFilters.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => store.setFilter(id)}
                className={cn(
                  "mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                  store.filter === id
                    ? "bg-[var(--color-panel)] font-medium text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel)]",
                )}
              >
                <span>{label}</span>
                {id === "missing" && missingCount > 0 && (
                  <span className="text-[10px] text-amber-400">{missingCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="border-b border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Counts</p>
            <div className="space-y-1 text-[11px] text-[var(--color-muted-foreground)]">
              <p>{store.items.length} total</p>
              <p>{typeCounts.image ?? 0} images</p>
              <p>{typeCounts.video ?? 0} videos</p>
              <p>{typeCounts.audio ?? 0} audio</p>
            </div>
          </div>

          <div className="mt-auto border-t border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Service plan</p>
            {activePlan ? (
              <div className="rounded-md bg-[var(--color-panel)] px-2 py-2 text-[11px]">
                <p className="font-medium text-[var(--color-foreground)]">{activePlan.title}</p>
                <p className="mt-0.5 text-[var(--color-subtle)]">{activePlan.items.length} items</p>
                <Link to="/service" className="mt-1 inline-block text-[var(--color-primary)] hover:underline">
                  Open Library
                </Link>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--color-subtle)]">
                No plan loaded.{" "}
                <Link to="/service" className="text-[var(--color-primary)] hover:underline">
                  Create one
                </Link>
              </p>
            )}
          </div>
        </aside>

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-[var(--color-background)]",
            dragOver && "ring-2 ring-inset ring-[var(--color-primary)]",
          )}
          onDragOver={(event) => {
            if (!isMediaDragEvent(event)) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => void handleDrop(event)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2">
            <div className="relative min-w-0 flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
              <input
                value={store.search}
                onChange={(e) => store.setSearch(e.target.value)}
                placeholder="Search by name or tag…"
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-8 pr-3 text-xs focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--color-subtle)]">
              <span>{filtered.length} shown</span>
              {missingCount > 0 && <span className="text-amber-400">{missingCount} missing</span>}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {store.loading ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-subtle)]">
                Loading media…
              </div>
            ) : filtered.length === 0 ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--color-border-light)] p-8 text-center"
                onClick={() => void handleImport()}
              >
                <Upload className="h-10 w-10 text-[var(--color-subtle)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">Import your first media files</p>
                  <p className="mt-1 text-xs text-[var(--color-subtle)]">
                    Drag files here or click Import files — images, videos, and audio are copied into the app library.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
                >
                  Choose files
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((item) => (
                  <MediaThumbnail
                    key={item.id}
                    item={item}
                    selected={store.selectedId === item.id}
                    onClick={() => void store.selectItem(item.id)}
                    onDoubleClick={() => {
                      void store.selectItem(item.id).then(() => store.goLiveSelected());
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const paths = Array.from(event.target.files ?? []).map((file) => {
                const withPath = file as File & { path?: string };
                return withPath.path ?? file.name;
              });
              if (paths.length > 0) void store.importFiles(paths);
              event.target.value = "";
            }}
          />
        </main>

        <aside className="flex w-[300px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
          {selected ? (
            <>
              <div className="border-b border-[var(--color-border)] p-3">
                <MediaPreview item={selected} />
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                <Field label="Name">
                  <input
                    key={selected.id}
                    defaultValue={selected.name}
                    onBlur={(e) => {
                      if (e.target.value !== selected.name) {
                        void store.updateItem(selected.id, { name: e.target.value });
                      }
                    }}
                    className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                  />
                </Field>

                <div>
                  <p className="text-[10px] text-[var(--color-subtle)]">Type · {selected.media_type}</p>
                  <p className="mt-1 break-all text-[10px] text-[var(--color-subtle)]">{selected.file_path}</p>
                  <p className="mt-1 text-[10px] text-[var(--color-subtle)]">
                    Added {new Date(selected.created_at).toLocaleString()}
                  </p>
                </div>

                <Field label="Tags">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {selectedTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="pill text-[10px]"
                      >
                        {tag} ×
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTag()}
                      placeholder="Add tag"
                      className="h-7 flex-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                    />
                    <button type="button" onClick={addTag} className="rounded-md bg-[var(--color-panel-hover)] px-2 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Field>

                <button
                  type="button"
                  onClick={() => void store.addSelectedToService()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] py-2 text-xs font-semibold text-white"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Add to service plan
                </button>
              </div>
              <div className="border-t border-[var(--color-border)] p-3">
                <button
                  type="button"
                  onClick={() => void store.removeItem(selected.id)}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-red-900/50 py-1.5 text-[11px] text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove from library
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-4 text-xs text-[var(--color-subtle)]">
              Select a media item
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}
