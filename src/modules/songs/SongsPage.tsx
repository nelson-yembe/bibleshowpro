import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Copy,
  Download,
  GripVertical,
  Layers,
  Music2,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Pill, StatusBadge } from "@/components/ui/pill";
import {
  SECTION_TYPES,
  SONG_TAG_FILTERS,
  defaultSongTheme,
  groupSlidesBySection,
  parseSongTags,
  parseSongTheme,
  sectionLineCount,
  sectionLinesPerSlide,
  sectionSlideCount,
  type LyricSlide,
  type SongSection,
} from "@/lib/songTypes";
import { isSongLowerThirdMode } from "@/lib/songLive";
import { LowerThirdControls } from "@/components/presentation/LowerThirdControls";
import { downloadTextFile, cn } from "@/lib/utils";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { registerSongLiveNavigation, useSongStore } from "@/stores/songStore";
import { usePresentationStore } from "@/stores/presentationStore";

const SECTION_TYPE_COLORS: Record<string, string> = {
  verse: "text-blue-300",
  chorus: "text-emerald-300",
  bridge: "text-purple-300",
  tag: "text-amber-300",
  ending: "text-rose-300",
  pre_chorus: "text-cyan-300",
  intro: "text-[var(--color-subtle)]",
  instrumental: "text-[var(--color-subtle)]",
  spoken: "text-[var(--color-subtle)]",
};

type SongTab = "project" | "edit";

const PROJECTION_TABS = [
  { value: "fullscreen" as const, label: "Fullscreen" },
  { value: "lower_third" as const, label: "Lower Third" },
];

function SortableSectionRow({
  section,
  selected,
  defaultLinesPerSlide,
  onSelect,
  onLinesPerSlideChange,
}: {
  section: SongSection;
  selected: boolean;
  defaultLinesPerSlide: number;
  onSelect: () => void;
  onLinesPerSlideChange: (lines: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const slideCount = sectionSlideCount(section, defaultLinesPerSlide);
  const lineCount = sectionLineCount(section);
  const linesPerSlide = sectionLinesPerSlide(section, defaultLinesPerSlide);
  const hasOverride = section.lines_per_slide != null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-md border px-2 py-2 text-xs",
        selected
          ? "border-[var(--color-primary)] bg-blue-950/30"
          : "border-[var(--color-border-light)] hover:bg-[var(--color-panel)]",
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" className="cursor-grab text-[var(--color-subtle)]" {...attributes} {...listeners}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={onSelect}>
          {section.label}
        </button>
        <span className="shrink-0 rounded bg-[var(--color-panel-hover)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-primary)]">
          {slideCount} slide{slideCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-6">
        <span className="text-[10px] capitalize text-[var(--color-subtle)]">
          {section.section_type.replace("_", " ")}
          {lineCount > 0 ? ` · ${lineCount} line${lineCount === 1 ? "" : "s"}` : ""}
        </span>
        <label
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="text-[9px] text-[var(--color-subtle)]">Lines/slide</span>
          <input
            type="number"
            min={1}
            max={12}
            value={linesPerSlide}
            onChange={(e) => onLinesPerSlideChange(Number(e.target.value))}
            className={cn(
              "h-6 w-10 rounded border bg-[var(--color-panel)] px-1 text-center text-[10px] tabular-nums",
              hasOverride
                ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                : "border-[var(--color-border-light)] text-[var(--color-subtle)]",
            )}
            title="Lines of lyrics per projection slide for this section"
          />
        </label>
      </div>
    </div>
  );
}

function LyricSlideCard({
  slide,
  index,
  active,
  queued,
  onPreview,
  onGoLive,
}: {
  slide: LyricSlide;
  index: number;
  active: boolean;
  queued: boolean;
  onPreview: () => void;
  onGoLive: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPreview}
      onDoubleClick={(e) => {
        e.preventDefault();
        onGoLive();
      }}
      className={cn(
        "flex h-[96px] w-[148px] shrink-0 flex-col overflow-hidden rounded-lg border text-left transition-colors",
        active
          ? "border-[var(--color-primary)] bg-blue-950/40 ring-2 ring-[var(--color-primary)]/40"
          : queued
            ? "border-amber-700/60 bg-amber-950/20"
            : "border-[var(--color-border-light)] bg-[#0a0c12] hover:border-[var(--color-border)] hover:bg-[var(--color-panel)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border-light)]/60 px-2 py-1">
        <span className={cn("text-[10px] font-bold tabular-nums", active ? "text-blue-300" : "text-[var(--color-subtle)]")}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="truncate text-[9px] text-[var(--color-subtle)]">{slide.section_label ?? "Slide"}</span>
      </div>
      <p className="line-clamp-4 flex-1 whitespace-pre-line px-2 py-1.5 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
        {slide.text || "Empty slide"}
      </p>
    </button>
  );
}

export function SongsPage() {
  const store = useSongStore();
  const previewSource = usePresentationStore((s) => s.previewSource);
  const program = usePresentationStore((s) => s.program);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const [tab, setTab] = useState<SongTab>("project");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [newSongSession, setNewSongSession] = useState(false);

  const handleNewSong = async () => {
    setNewSongSession(true);
    setTab("edit");
    await store.createBlank();
  };

  const handleSelectSong = async (id: string) => {
    setNewSongSession(false);
    setTab("project");
    await store.selectSong(id);
  };

  const handleSaveAndView = async () => {
    await store.saveSong();
    setTab("project");
    setNewSongSession(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void store.loadSongs();
  }, [store.loadSongs]);

  const song = store.activeSong;
  const slides = store.effectiveSlides();

  useEffect(() => {
    if (newSongSession && !store.saving && !store.dirty && slides.length > 0) {
      setTab("project");
      setNewSongSession(false);
    }
  }, [newSongSession, store.saving, store.dirty, slides.length]);

  useEffect(() => {
    registerSongLiveNavigation();
    return () => useLiveNavigationStore.getState().unregister();
  }, [store.activeSong?.id, store.slideIndex, store.dirty, slides.length]);
  const currentSlide = store.currentSlide();
  const nextSlide = store.nextSlidePreview();
  const warnings = store.warnings();
  const tags = song ? parseSongTags(song.tags_json) : [];

  const arrangementOrder = useMemo(() => {
    if (!song) return [];
    const arr = song.arrangements.find((a) => a.is_default);
    const ids = arr ? (JSON.parse(arr.section_order_json) as string[]) : song.sections.map((s) => s.id);
    return ids.map((id) => song.sections.find((s) => s.id === id)).filter(Boolean) as SongSection[];
  }, [song]);

  const activeSectionId = selectedSectionId ?? arrangementOrder[0]?.id ?? null;
  const sectionGroups = useMemo(
    () => (song ? groupSlidesBySection(song, slides) : []),
    [song, slides],
  );
  const sectionsWithLyrics = song?.sections.filter((s) => s.lyrics.trim()) ?? [];
  const songTheme = song ? parseSongTheme(song.theme_json) : defaultSongTheme();
  const isLowerThirdMode = isSongLowerThirdMode(songTheme);
  const effectiveTheme = store.projectionTheme();
  const effectiveLowerThird = effectiveTheme.lowerThird;
  const projectionMode = isLowerThirdMode ? "lower_third" : "fullscreen";

  const isLive = liveFollow && program && program.type !== "blackout";
  const syncedWithDock = previewSource === "song";

  const handleArrangementDrag = (event: DragEndEvent) => {
    if (!song) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = arrangementOrder.map((s) => s.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    store.reorderArrangement(arrayMove(ids, oldIndex, newIndex));
  };

  const previewSlide = (index: number) => {
    store.setSlideIndex(index);
  };

  const goLiveSlide = (index: number) => {
    store.setSlideIndex(index);
    void store.goLiveCurrent();
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={["Songs", song?.title ?? "Lyrics Library"]}
        status={isLive && syncedWithDock ? "live" : "ready"}
        actions={
          <div className="flex items-center gap-2">
            {store.saving ? (
              <StatusBadge variant="draft">Saving…</StatusBadge>
            ) : store.dirty ? (
              <StatusBadge variant="warn">Unsaved</StatusBadge>
            ) : (
              <StatusBadge variant="saved">● Saved</StatusBadge>
            )}
            {syncedWithDock && (
              <StatusBadge variant="saved">Preview synced</StatusBadge>
            )}
          </div>
        }
      />

      {store.importWarning && (
        <div className="border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-xs text-amber-200">
          {store.importWarning}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2">
          {warnings.map((w) => (
            <StatusBadge key={w} variant="warn">
              {w}
            </StatusBadge>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Song library */}
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[#0a0c12]">
          <div className="border-b border-[var(--color-border)] p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-subtle)]" />
              <input
                value={store.search}
                onChange={(e) => store.setSearch(e.target.value)}
                placeholder="Search songs…"
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] pl-8 pr-2 text-xs"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {SONG_TAG_FILTERS.map((f) => (
                <Pill key={f.id} active={store.filter === f.id} onClick={() => store.setFilter(f.id)}>
                  {f.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] p-2">
            <ActionBtn icon={Plus} label="New" onClick={() => void handleNewSong()} />
            <ActionBtn icon={Upload} label="Import" onClick={() => fileRef.current?.click()} />
            <ActionBtn
              icon={Download}
              label="Export"
              onClick={() => void store.exportLibrary().then((json) => downloadTextFile("songs-library.json", json))}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {store.loading ? (
              <p className="p-4 text-center text-xs text-[var(--color-subtle)]">Loading songs…</p>
            ) : store.songs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <Music2 className="h-10 w-10 text-[var(--color-subtle)] opacity-40" />
                <p className="text-sm text-[var(--color-muted-foreground)]">No songs yet</p>
                <button
                  type="button"
                  onClick={() => void handleNewSong()}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white"
                >
                  Create first song
                </button>
              </div>
            ) : (
              store.songs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleSelectSong(item.id)}
                  className={cn(
                    "mb-1 w-full rounded-lg border p-2.5 text-left transition-colors",
                    store.selectedId === item.id
                      ? "border-[var(--color-primary)] bg-blue-950/30"
                      : "border-[var(--color-border-light)]/60 hover:bg-[var(--color-panel)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                  </div>
                  <p className="truncate text-[10px] text-[var(--color-subtle)]">{item.artist ?? "Unknown artist"}</p>
                  <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-[var(--color-subtle)]">
                    {item.default_key && <span>{item.default_key}</span>}
                    {item.bpm && <span>· {item.bpm} BPM</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Main — project or edit */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#06080d]">
          {!song ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <Music2 className="h-12 w-12 text-[var(--color-subtle)] opacity-30" />
              <p className="text-sm font-medium text-[var(--color-foreground)]">Select a song to project lyrics</p>
              <p className="max-w-sm text-xs text-[var(--color-muted-foreground)]">
                Choose a song from the library. Slides appear here — click to preview in the Live panel, then press GO LIVE.
              </p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
                <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-light)] p-0.5">
                  <TabButton active={tab === "project"} onClick={() => setTab("project")} icon={Play} label="Project" />
                  <TabButton active={tab === "edit"} onClick={() => setTab("edit")} icon={Pencil} label="Edit lyrics" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{song.title}</p>
                  <p className="truncate text-[10px] text-[var(--color-subtle)]">
                    {[song.artist, song.default_key, song.bpm ? `${song.bpm} BPM` : null].filter(Boolean).join(" · ") ||
                      "No metadata"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void store.toggleFavorite()}
                  className="rounded p-1.5 hover:bg-[var(--color-panel)]"
                  title="Favorite"
                >
                  <Star className={cn("h-4 w-4", song.favorite ? "fill-amber-400 text-amber-400" : "text-[var(--color-subtle)]")} />
                </button>
                <button
                  type="button"
                  onClick={() => void store.addToService()}
                  className="flex items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[11px] hover:bg-[var(--color-panel)]"
                >
                  <Layers className="h-3 w-3" /> Add to plan
                </button>
                <button type="button" onClick={() => void store.duplicateSong()} className="rounded p-1.5 hover:bg-[var(--color-panel)]" title="Duplicate">
                  <Copy className="h-4 w-4 text-[var(--color-subtle)]" />
                </button>
                <button type="button" onClick={() => void store.deleteSong()} className="rounded p-1.5 hover:bg-[var(--color-panel)]" title="Delete">
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>

              {tab === "project" ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  {slides.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {sectionsWithLyrics.length > 0 ? "Lyrics found — generating slides…" : "No lyrics to project yet"}
                      </p>
                      <p className="max-w-md text-xs text-[var(--color-subtle)]">
                        {sectionsWithLyrics.length > 0
                          ? "If slides still do not appear, open Edit lyrics and confirm each section has text, then save."
                          : "Open Edit lyrics, add your Verse and Chorus text, then return here to project."}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTab("edit")}
                        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
                      >
                        {sectionsWithLyrics.length > 0 ? "Review lyrics" : "Add lyrics"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="shrink-0 space-y-3 border-b border-[var(--color-border)] px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="section-label">Projection format</p>
                          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-light)] p-0.5">
                            {PROJECTION_TABS.map((tab) => (
                              <button
                                key={tab.value}
                                type="button"
                                onClick={() => store.setProjectionMode(tab.value)}
                                className={cn(
                                  "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                                  projectionMode === tab.value
                                    ? "bg-[var(--color-primary)] text-white"
                                    : "text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
                                )}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {isLowerThirdMode && (
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                            <LowerThirdControls
                              effective={effectiveLowerThird}
                              state={{
                                lowerThird: store.lowerThirdOverrides,
                                showLowerThirdSafeMargins: store.showLowerThirdSafeMargins,
                                lowerThirdChromaPreview: store.lowerThirdChromaPreview,
                              }}
                              onChange={(patch) => store.setLowerThirdOverrides(patch as Record<string, unknown>)}
                              showReference
                            />
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
                        <p className="section-label mb-2">Song sections — click to jump</p>
                        <div className="flex flex-wrap gap-2">
                          {arrangementOrder.map((section) => {
                            const hasLyrics = section.lyrics.trim().length > 0;
                            const firstSlide = slides.findIndex((s) => s.section_id === section.id);
                            const isActive = currentSlide?.section_id === section.id;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                disabled={!hasLyrics || firstSlide < 0}
                                onClick={() => void store.jumpToSection(section.id)}
                                className={cn(
                                  "rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                                  isActive
                                    ? "border-[var(--color-primary)] bg-blue-950/40 text-blue-200"
                                    : hasLyrics
                                      ? "border-[var(--color-border-light)] bg-[var(--color-panel)] hover:border-[var(--color-primary)]"
                                      : "cursor-not-allowed border-[var(--color-border-light)]/50 opacity-40",
                                  SECTION_TYPE_COLORS[section.section_type] ?? "text-[var(--color-foreground)]",
                                )}
                              >
                                {section.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
                        <div className="flex min-h-0 flex-col rounded-xl border border-[var(--color-primary)]/30 bg-blue-950/10 p-4">
                          <p className="section-label mb-2 text-blue-300/80">
                            Current · slide {store.slideIndex + 1} of {slides.length}
                          </p>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                            {currentSlide?.section_label ?? "—"}
                          </p>
                          <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-base leading-relaxed text-[var(--color-foreground)]">
                            {currentSlide?.text ?? "—"}
                          </p>
                        </div>
                        <div className="flex min-h-0 flex-col rounded-xl border border-amber-800/30 bg-amber-950/10 p-4">
                          <p className="section-label mb-2 text-amber-300/80">Up next</p>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                            {nextSlide?.section_label ?? "End of song"}
                          </p>
                          <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                            {nextSlide?.text ?? "—"}
                          </p>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--color-border)] bg-[#0a0c12] p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="section-label">All slides by section</p>
                          <p className="text-[10px] text-[var(--color-subtle)]">
                            Click slide to preview · Double-click to go live
                          </p>
                        </div>
                        <div className="space-y-4">
                          {sectionGroups.map(({ section, slides: sectionSlides }) => (
                            <div key={section.id}>
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-xs font-semibold capitalize",
                                    SECTION_TYPE_COLORS[section.section_type] ?? "text-[var(--color-foreground)]",
                                  )}
                                >
                                  {section.label}
                                </span>
                                <span className="text-[10px] text-[var(--color-subtle)]">
                                  {sectionSlides.length} slide{sectionSlides.length === 1 ? "" : "s"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void store.jumpToSection(section.id)}
                                  className="ml-auto text-[10px] text-[var(--color-primary)] hover:underline"
                                >
                                  Jump here
                                </button>
                              </div>
                              {sectionSlides.length === 0 ? (
                                <p className="text-[11px] italic text-[var(--color-subtle)]">No slides — add lyrics in Edit</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {sectionSlides.map((slide) => (
                                    <LyricSlideCard
                                      key={slide.id}
                                      slide={slide}
                                      index={slide.globalIndex}
                                      active={slide.globalIndex === store.slideIndex}
                                      queued={slide.globalIndex === store.slideIndex + 1}
                                      onPreview={() => previewSlide(slide.globalIndex)}
                                      onGoLive={() => goLiveSlide(slide.globalIndex)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
                    <input
                      value={song.title}
                      onChange={(e) => store.updateDraft({ title: e.target.value })}
                      className="h-8 min-w-[160px] flex-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-sm font-semibold"
                    />
                    <input
                      value={song.artist ?? ""}
                      onChange={(e) => store.updateDraft({ artist: e.target.value })}
                      placeholder="Artist"
                      className="h-8 w-36 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                    />
                    <input
                      value={song.default_key ?? ""}
                      onChange={(e) => store.updateDraft({ default_key: e.target.value })}
                      placeholder="Key"
                      className="h-8 w-16 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                    />
                    <input
                      value={song.bpm ?? ""}
                      onChange={(e) => store.updateDraft({ bpm: Number(e.target.value) || undefined })}
                      placeholder="BPM"
                      className="h-8 w-16 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                    />
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-2">
                    <div className="flex min-h-0 flex-col border-r border-[var(--color-border)]">
                      <div className="border-b border-[var(--color-border)] px-3 py-2">
                        <p className="section-label">Sections</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {SECTION_TYPES.map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => store.addSection(t.value)}
                              className="rounded border border-[var(--color-border-light)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-panel)]"
                            >
                              + {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                        {song.sections.map((section) => (
                          <div
                            key={section.id}
                            className={cn(
                              "rounded-md border p-2",
                              activeSectionId === section.id
                                ? "border-[var(--color-primary)] bg-blue-950/20"
                                : "border-[var(--color-border-light)]",
                            )}
                          >
                            <button type="button" className="w-full text-left" onClick={() => setSelectedSectionId(section.id)}>
                              <p className="text-xs font-medium">{section.label}</p>
                            </button>
                            <textarea
                              value={section.lyrics}
                              onChange={(e) => {
                                const sections = song.sections.map((s) =>
                                  s.id === section.id ? { ...s, lyrics: e.target.value } : s,
                                );
                                store.updateDraft({ sections });
                              }}
                              rows={4}
                              className="mt-1 w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2 text-xs leading-relaxed"
                              placeholder="Enter lyrics…"
                            />
                            <button
                              type="button"
                              onClick={() => store.removeSection(section.id)}
                              className="mt-1 text-[10px] text-red-400"
                            >
                              Remove section
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-[var(--color-border)] p-3">
                        <p className="section-label mb-1">Paste lyrics</p>
                        <textarea
                          ref={pasteRef}
                          rows={3}
                          placeholder="Paste with [Verse 1], [Chorus] headers…"
                          className="w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const raw = pasteRef.current?.value ?? "";
                            if (raw.trim()) void store.importText(song.title + " (import)", song.artist ?? "", raw, tags);
                          }}
                          className="mt-1 text-xs text-[var(--color-primary)]"
                        >
                          Parse into new song
                        </button>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col">
                      <div className="border-b border-[var(--color-border)] px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="section-label">Arrangement order</p>
                            <p className="text-[10px] text-[var(--color-subtle)]">
                              Drag worship flow · set lines per slide per section
                            </p>
                          </div>
                          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-subtle)]">
                            Default lines/slide
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={store.linesPerSlide}
                              onChange={(e) => store.setDefaultLinesPerSlide(Number(e.target.value))}
                              className="h-6 w-10 rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-1 text-center text-[10px] tabular-nums"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleArrangementDrag}>
                          <SortableContext items={arrangementOrder.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                            {arrangementOrder.map((section) => (
                              <SortableSectionRow
                                key={section.id}
                                section={section}
                                selected={activeSectionId === section.id}
                                defaultLinesPerSlide={store.linesPerSlide}
                                onSelect={() => setSelectedSectionId(section.id)}
                                onLinesPerSlideChange={(lines) => store.setSectionLinesPerSlide(section.id, lines)}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      </div>

                      <div className="space-y-2 border-t border-[var(--color-border)] p-3">
                        <p className="section-label">Copyright & licensing</p>
                        <div className="grid grid-cols-2 gap-2">
                          <FieldInput
                            label="Author"
                            value={song.copyright?.author ?? ""}
                            onChange={(v) =>
                              store.updateDraft({
                                copyright: { ...(song.copyright ?? { song_id: song.id }), author: v },
                              })
                            }
                          />
                          <FieldInput
                            label="CCLI #"
                            value={song.copyright?.ccli_number ?? ""}
                            onChange={(v) =>
                              store.updateDraft({
                                copyright: { ...(song.copyright ?? { song_id: song.id }), ccli_number: v },
                              })
                            }
                          />
                        </div>
                        <textarea
                          value={song.copyright?.license_text ?? ""}
                          onChange={(e) =>
                            store.updateDraft({
                              copyright: { ...(song.copyright ?? { song_id: song.id }), license_text: e.target.value },
                            })
                          }
                          rows={2}
                          placeholder="License line on projection footer"
                          className="w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2 text-xs"
                        />
                        <textarea
                          value={song.operator_notes ?? ""}
                          onChange={(e) => store.updateDraft({ operator_notes: e.target.value })}
                          rows={2}
                          placeholder="Operator notes (not projected)"
                          className="w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveAndView()}
                          disabled={store.saving}
                          className="w-full rounded-lg bg-[var(--color-primary)] py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {store.saving ? "Saving…" : "Save & view slides"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.csv,.md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void store.importFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Play;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-[var(--color-primary)] text-white"
          : "text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border-light)] py-1.5 text-[10px] hover:bg-[var(--color-panel)]"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function FieldInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-[var(--color-subtle)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-7 w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
      />
    </label>
  );
}
