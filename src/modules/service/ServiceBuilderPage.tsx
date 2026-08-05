import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Image,
  ListOrdered,
  Megaphone,
  Mic,
  Monitor,
  Music,
  Plus,
  Timer,
  Trash2,
  Type,
  Video,
  Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StagingPreview } from "@/components/presentation/StagingPreview";
import { MediaPickerModal } from "@/components/service/MediaPickerModal";
import { ServiceItemEditor } from "@/components/service/ServiceItemEditor";
import { SongPickerModal } from "@/components/service/SongPickerModal";
import { StatusBadge } from "@/components/ui/pill";
import { defaultContentForType, parseServiceItemContent, stringifyServiceItemContent } from "@/lib/serviceItemContent";
import {
  deepLinkForItem,
  formatItemType,
  isPresentableServiceItem,
  itemDurationLabel,
  neighborPresentableIndex,
  SERVICE_ITEM_COLORS,
} from "@/lib/serviceItemMeta";
import { SERVICE_TEMPLATES } from "@/lib/serviceTemplates";
import { serviceItemContentFromMedia } from "@/lib/mediaLive";
import { serviceItemContentFromSong } from "@/lib/songLive";
import type { MediaRecord, ServiceItem } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useBibleStore } from "@/stores/bibleStore";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { useMediaStore } from "@/stores/mediaStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useSongStore } from "@/stores/songStore";
import { useThemeStore } from "@/stores/themeStore";

const addItems = [
  { type: "section", label: "Section", icon: ListOrdered, color: "text-[var(--color-muted-foreground)]" },
  { type: "countdown", label: "Countdown", icon: Timer, color: "text-orange-400" },
  { type: "logo", label: "Logo", icon: Monitor, color: "text-slate-400" },
  { type: "song", label: "Song", icon: Music, color: "text-purple-400" },
  { type: "announcement", label: "Announcement", icon: Megaphone, color: "text-blue-400" },
  { type: "scripture", label: "Scripture", icon: BookOpen, color: "text-sky-400" },
  { type: "sermon_note", label: "Sermon Note", icon: Mic, color: "text-emerald-400" },
  { type: "speaker_lower_third", label: "Lower Third", icon: Type, color: "text-pink-400" },
  { type: "video", label: "Video", icon: Video, color: "text-red-400" },
  { type: "image", label: "Image", icon: Image, color: "text-amber-400" },
  { type: "blank", label: "Blank", icon: Plus, color: "text-gray-400" },
];

type PickerState =
  | { mode: "song"; replaceItemId?: string }
  | { mode: "video"; replaceItemId?: string }
  | { mode: "image"; replaceItemId?: string }
  | null;

function displayIndex(items: ServiceItem[], index: number): string {
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if (isPresentableServiceItem(items[i]!)) n += 1;
  }
  return String(n).padStart(2, "0");
}

function SortableRow({
  item,
  index,
  items,
  selected,
  role,
  onSelect,
  onDelete,
  onGoLive,
}: {
  item: ServiceItem;
  index: number;
  items: ServiceItem[];
  selected: boolean;
  role: "now" | "next" | "preview" | null;
  onSelect: () => void;
  onDelete: (id: string) => void;
  onGoLive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isSection = item.item_type === "section";
  const duration = itemDurationLabel(item);

  if (isSection) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        onClick={onSelect}
        className={cn(
          "group flex cursor-pointer items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2",
          selected && "ring-1 ring-inset ring-[var(--color-primary)]/40",
        )}
      >
        <button
          type="button"
          className="cursor-grab text-[var(--color-subtle)] opacity-0 group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-subtle)]">
          {item.title}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="text-[var(--color-subtle)] opacity-0 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onGoLive();
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-3 border-b border-[var(--color-border)] px-4 py-2.5 transition-colors",
        role === "now" && "bg-red-950/25 border-l-2 border-l-red-500",
        role === "next" && "bg-amber-950/15 border-l-2 border-l-amber-500/70",
        role === "preview" && "bg-blue-950/20 border-l-2 border-l-[var(--color-primary)]",
        !role && "hover:bg-[var(--color-panel-hover)]",
      )}
    >
      <button
        type="button"
        className="cursor-grab text-[var(--color-subtle)] opacity-0 group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-[11px] font-mono text-[var(--color-subtle)]">{displayIndex(items, index)}</span>
      <div className={cn("h-8 w-1 rounded-full", SERVICE_ITEM_COLORS[item.item_type] ?? "bg-gray-500")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-[11px] capitalize text-[var(--color-subtle)]">
          {formatItemType(item.item_type)}
          {duration ? ` · ${duration}` : ""}
          {item.operator_notes ? ` · ${item.operator_notes}` : ""}
        </p>
      </div>
      {role === "now" ? (
        <StatusBadge variant="live">Now</StatusBadge>
      ) : role === "next" ? (
        <StatusBadge variant="preview">Next</StatusBadge>
      ) : role === "preview" ? (
        <StatusBadge variant="preview">Preview</StatusBadge>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.id);
        }}
        className="text-[var(--color-subtle)] opacity-0 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ServiceBuilderPage() {
  const store = useServiceStore();
  const navigate = useNavigate();
  const { themeRevision } = useThemeStore();
  const program = usePresentationStore((s) => s.program);
  const preview = usePresentationStore((s) => s.preview);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const isBlackout = program?.type === "blackout";

  const [scriptureRef, setScriptureRef] = useState("Romans 8:28-30");
  const [newTitle, setNewTitle] = useState("Sunday Morning Service");
  const [bulkScripture, setBulkScripture] = useState("");
  const [picker, setPicker] = useState<PickerState>(null);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void store.init();
  }, [store.init]);

  const selectedItem =
    store.activePlan?.items.find((item) => item.id === store.activeItemId) ?? store.activePlan?.items[0] ?? null;

  useEffect(() => {
    if (selectedItem && isPresentableServiceItem(selectedItem)) {
      void store.previewActiveItem();
    }
  }, [themeRevision, selectedItem?.id, store.previewActiveItem]);

  useEffect(() => {
    if (selectedItem?.item_type === "scripture") {
      try {
        const content = JSON.parse(selectedItem.content_json || "{}") as { reference?: string };
        if (content.reference) setScriptureRef(content.reference);
      } catch {
        // ignore
      }
    }
  }, [selectedItem?.id, selectedItem?.content_json, selectedItem?.item_type]);

  const itemIndex = useMemo(() => {
    if (!store.activePlan || !store.activeItemId) return -1;
    return store.activePlan.items.findIndex((item) => item.id === store.activeItemId);
  }, [store.activePlan, store.activeItemId]);

  const items = store.activePlan?.items ?? [];

  const nowItem = useMemo(() => {
    if (!liveFollow || isBlackout || !store.activePlan) return null;
    if (selectedItem && isPresentableServiceItem(selectedItem)) return selectedItem;
    // Stay on last presentable cue when operator selects a section header
    const prevIdx = neighborPresentableIndex(store.activePlan.items, itemIndex, -1);
    return prevIdx >= 0 ? store.activePlan.items[prevIdx] ?? null : null;
  }, [liveFollow, isBlackout, selectedItem, store.activePlan, itemIndex]);

  const nextItem = useMemo(() => {
    if (!store.activePlan) return null;
    const from = itemIndex >= 0 ? itemIndex : -1;
    const nextIdx = neighborPresentableIndex(store.activePlan.items, from, 1);
    return nextIdx >= 0 ? store.activePlan.items[nextIdx] ?? null : null;
  }, [store.activePlan, itemIndex]);

  const canPrev = useMemo(() => {
    if (!store.activePlan) return false;
    return neighborPresentableIndex(store.activePlan.items, itemIndex, -1) >= 0;
  }, [store.activePlan, itemIndex]);

  const canNext = useMemo(() => {
    if (!store.activePlan) return false;
    return neighborPresentableIndex(store.activePlan.items, itemIndex, 1) >= 0;
  }, [store.activePlan, itemIndex]);

  useEffect(() => {
    useLiveNavigationStore.getState().register({
      onPrev: () => void store.prevItem(),
      onNext: () => void store.nextItem(),
      canPrev,
      canNext,
      label: "Service run sheet",
      beforeGoLive: async () => {
        const plan = useServiceStore.getState().activePlan;
        const itemId = useServiceStore.getState().activeItemId;
        const item = plan?.items.find((i) => i.id === itemId);
        if (item && isPresentableServiceItem(item)) {
          const { previewServiceItem } = await import("@/lib/serviceLive");
          const { useThemeStore } = await import("@/stores/themeStore");
          await previewServiceItem(item, useThemeStore.getState().activeTheme);
        }
      },
    });
    return () => useLiveNavigationStore.getState().unregister();
  }, [store, canPrev, canNext]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!store.activePlan) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = store.activePlan.items.findIndex((item) => item.id === active.id);
    const newIndex = store.activePlan.items.findIndex((item) => item.id === over.id);
    void store.reorderItems(arrayMove(store.activePlan.items, oldIndex, newIndex).map((item) => item.id));
  };

  const handleAddItem = async (type: string, label: string) => {
    if (type === "song") {
      setPicker({ mode: "song" });
      return;
    }
    if (type === "video") {
      setPicker({ mode: "video" });
      return;
    }
    if (type === "image") {
      setPicker({ mode: "image" });
      return;
    }
    if (type === "section") {
      await store.addItem("section", "Section", stringifyServiceItemContent({}), { notify: false });
      return;
    }
    if (type === "scripture") {
      await store.addItem(type, scriptureRef, stringifyServiceItemContent({ reference: scriptureRef }), {
        notify: false,
      });
      return;
    }
    const content = defaultContentForType(type);
    await store.addItem(type, label, stringifyServiceItemContent(content), { notify: false });
  };

  const handleBulkImport = async () => {
    if (!bulkScripture.trim()) return;
    setImporting(true);
    try {
      const count = await store.importScriptureList(bulkScripture);
      if (count > 0) setBulkScripture("");
    } finally {
      setImporting(false);
    }
  };

  const handleSongPick = async (song: { id: string; title: string }) => {
    if (picker?.replaceItemId) {
      await store.updateItem(picker.replaceItemId, {
        title: song.title,
        contentJson: serviceItemContentFromSong(song.id, 0),
      });
      return;
    }
    await store.addItem("song", song.title, serviceItemContentFromSong(song.id, 0), { notify: false });
  };

  const handleMediaPick = async (item: MediaRecord) => {
    const itemType = item.media_type === "video" ? "video" : "image";
    const contentJson = serviceItemContentFromMedia(item);
    if (picker?.replaceItemId) {
      await store.updateItem(picker.replaceItemId, { title: item.name, contentJson });
      return;
    }
    await store.addItem(itemType, item.name, contentJson, { notify: false });
  };

  const openDeepLink = async (item: ServiceItem) => {
    const link = deepLinkForItem(item);
    if (!link) return;
    const content = parseServiceItemContent(item.content_json);

    if (item.item_type === "scripture") {
      const ref = content.reference ?? item.title;
      useBibleStore.getState().setQuery(ref);
      void useBibleStore.getState().search(ref);
      navigate("/bible");
      return;
    }
    if (item.item_type === "song" && content.songId) {
      await useSongStore.getState().selectSong(content.songId);
      navigate("/songs");
      return;
    }
    if ((item.item_type === "video" || item.item_type === "image") && content.mediaId) {
      useMediaStore.getState().selectItem(content.mediaId);
      navigate("/media");
      return;
    }
    navigate(link.to);
  };

  const isLive = liveFollow && program && !isBlackout;
  const canGoLive = Boolean(selectedItem && isPresentableServiceItem(selectedItem));
  const deepLink = selectedItem ? deepLinkForItem(selectedItem) : null;

  const rowRole = (item: ServiceItem): "now" | "next" | "preview" | null => {
    if (nowItem?.id === item.id) return "now";
    if (nextItem?.id === item.id && nowItem?.id !== item.id) return "next";
    if (!isLive && selectedItem?.id === item.id && isPresentableServiceItem(item)) return "preview";
    return null;
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={["Service", store.activePlan?.title ?? "Run sheet", selectedItem?.title ?? "No item"]}
        status={isLive ? "live" : "ready"}
        actions={
          store.saving ? (
            <StatusBadge variant="saved">Saving…</StatusBadge>
          ) : (
            <StatusBadge variant="saved">● Synced</StatusBadge>
          )
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] p-3">
            <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
              Run sheet for this service. Stage and take items live — Bible Search, Songs, and Media stay one click
              away.
            </p>
          </div>

          <div className="border-b border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--color-panel)]"
            >
              <span className="section-label">Add to run sheet</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-[var(--color-subtle)] transition-transform", addOpen && "rotate-180")} />
            </button>
            {addOpen && (
              <div className="space-y-3 px-3 pb-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {addItems.map(({ type, label, icon: Icon, color }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => void handleAddItem(type, label)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2.5 text-[10px] font-medium transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-panel-hover)]"
                    >
                      <Icon className={cn("h-4 w-4", color)} />
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="section-label mb-1">Scripture reference</p>
                  <input
                    value={scriptureRef}
                    onChange={(e) => setScriptureRef(e.target.value)}
                    className="h-7 w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
                    placeholder="Romans 8:28"
                  />
                </div>
                <div>
                  <p className="section-label mb-1">Bulk scripture import</p>
                  <textarea
                    value={bulkScripture}
                    onChange={(e) => setBulkScripture(e.target.value)}
                    rows={3}
                    placeholder={"Psalm 23\nJohn 3:16\nRomans 8:28-30"}
                    className="w-full rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-[10px]"
                  />
                  <button
                    type="button"
                    disabled={!bulkScripture.trim() || importing}
                    onClick={() => void handleBulkImport()}
                    className="mt-1.5 w-full rounded bg-[var(--color-primary)] py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
                  >
                    {importing ? "Importing…" : "Import list"}
                  </button>
                </div>
                <div>
                  <p className="section-label mb-1">Templates</p>
                  {SERVICE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => void store.createPlanFromTemplate(template.id)}
                      className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel)]"
                    >
                      <Calendar className="h-3 w-3" />
                      {template.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setPlansOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--color-panel)]"
            >
              <span className="section-label">Plans</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-[var(--color-subtle)] transition-transform", plansOpen && "rotate-180")} />
            </button>
            {(plansOpen || !store.activePlan) && (
              <div className="px-3 pb-3">
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {store.plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => void store.selectPlan(plan.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs",
                        store.activePlan?.id === plan.id
                          ? "bg-blue-950/30 text-blue-300"
                          : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel)]",
                      )}
                    >
                      {plan.title}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-1">
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="h-7 flex-1 rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => void store.createPlan(newTitle)}
                    className="rounded bg-[var(--color-primary)] px-2 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-background)]">
          {store.activePlan ? (
            <>
              {/* NOW / NEXT command bar */}
              <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{store.activePlan.title}</h2>
                    <p className="text-[11px] text-[var(--color-subtle)]">
                      {items.filter(isPresentableServiceItem).length} cues
                      {itemIndex >= 0 ? ` · cue ${displayIndex(items, itemIndex)}` : ""}
                      {isLive ? " · on air follows selection" : " · double-click a row to go live"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canPrev}
                      onClick={() => void store.prevItem()}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2.5 text-[11px] font-semibold disabled:opacity-35"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={!canNext}
                      onClick={() => void store.nextItem()}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border-light)] px-2.5 text-[11px] font-semibold disabled:opacity-35"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={!canGoLive}
                      onClick={() => void store.goLiveActiveItem()}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-[11px] font-bold text-white disabled:opacity-35"
                    >
                      <Zap className="h-3.5 w-3.5 fill-current" />
                      Go live
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      nowItem ? "border-red-800/50 bg-red-950/20" : "border-[var(--color-border-light)] bg-[var(--color-panel)]",
                    )}
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-red-300/80">Now</p>
                    <p className="mt-0.5 truncate text-sm font-medium">
                      {nowItem?.title ?? (isLive ? "—" : "Standby — nothing on air")}
                    </p>
                    <p className="truncate text-[10px] capitalize text-[var(--color-subtle)]">
                      {nowItem ? formatItemType(nowItem.item_type) : "Take a cue live to start the run"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!nextItem}
                    onClick={() => nextItem && void store.selectItem(nextItem.id).then(() => store.goLiveActiveItem())}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      nextItem
                        ? "border-amber-800/40 bg-amber-950/15 hover:bg-amber-950/25"
                        : "border-[var(--color-border-light)] bg-[var(--color-panel)] opacity-60",
                    )}
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-300/80">
                      Next {nextItem ? "· click to take" : ""}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium">{nextItem?.title ?? "End of run sheet"}</p>
                    <p className="truncate text-[10px] capitalize text-[var(--color-subtle)]">
                      {nextItem ? formatItemType(nextItem.item_type) : "—"}
                    </p>
                  </button>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_280px]">
                <div className="min-h-0 overflow-y-auto border-r border-[var(--color-border)]">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                      {items.map((item, index) => (
                        <SortableRow
                          key={item.id}
                          item={item}
                          index={index}
                          items={items}
                          selected={store.activeItemId === item.id}
                          role={rowRole(item)}
                          onSelect={() => void store.selectItem(item.id)}
                          onDelete={(id) => void store.removeItem(id)}
                          onGoLive={() => {
                            void store.selectItem(item.id).then(() => store.goLiveActiveItem());
                          }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {items.length === 0 && (
                    <div className="m-4 rounded-lg border border-dashed border-[var(--color-border-light)] py-8 text-center text-xs text-[var(--color-subtle)]">
                      <p>Empty run sheet</p>
                      <p className="mt-1">
                        Add cues here, or send from{" "}
                        <Link to="/bible" className="text-[var(--color-primary)] hover:underline">
                          Bible Search
                        </Link>
                        ,{" "}
                        <Link to="/songs" className="text-[var(--color-primary)] hover:underline">
                          Songs
                        </Link>
                        , or{" "}
                        <Link to="/media" className="text-[var(--color-primary)] hover:underline">
                          Media
                        </Link>
                        .
                      </p>
                      <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="mt-3 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white"
                      >
                        Add first cue
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden min-h-0 flex-col overflow-y-auto lg:flex">
                  <div className="border-b border-[var(--color-border)] p-3">
                    <p className="section-label mb-2">Stage</p>
                    <div className="h-[160px]">
                      <StagingPreview
                        scene={preview}
                        className="!min-h-0 h-full"
                        label={selectedItem?.title ?? "Preview"}
                      />
                    </div>
                    {deepLink && selectedItem && (
                      <button
                        type="button"
                        onClick={() => void openDeepLink(selectedItem)}
                        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-border-light)] px-2 py-1.5 text-[10px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {deepLink.label}
                      </button>
                    )}
                  </div>
                  {selectedItem && (
                    <div className="p-3">
                      <ServiceItemEditor
                        item={selectedItem}
                        onPickSong={() => setPicker({ mode: "song", replaceItemId: selectedItem.id })}
                        onPickMedia={(type) => setPicker({ mode: type, replaceItemId: selectedItem.id })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {selectedItem && (
                <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4 lg:hidden">
                  <ServiceItemEditor
                    item={selectedItem}
                    onPickSong={() => setPicker({ mode: "song", replaceItemId: selectedItem.id })}
                    onPickMedia={(type) => setPicker({ mode: type, replaceItemId: selectedItem.id })}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Create or select a service plan to build your run sheet
              </p>
              <button
                type="button"
                onClick={() => void store.createPlan(newTitle)}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
              >
                New service plan
              </button>
            </div>
          )}
        </main>
      </div>

      <SongPickerModal
        open={picker?.mode === "song"}
        onClose={() => setPicker(null)}
        onSelect={(song) => void handleSongPick(song)}
      />
      <MediaPickerModal
        open={picker?.mode === "video"}
        mediaType="video"
        onClose={() => setPicker(null)}
        onSelect={(item) => void handleMediaPick(item)}
      />
      <MediaPickerModal
        open={picker?.mode === "image"}
        mediaType="image"
        onClose={() => setPicker(null)}
        onSelect={(item) => void handleMediaPick(item)}
      />
    </div>
  );
}
