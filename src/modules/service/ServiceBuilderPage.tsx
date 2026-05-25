import { useEffect, useMemo, useState } from "react";
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
  GripVertical,
  Image,
  Megaphone,
  Mic,
  Monitor,
  Music,
  Plus,
  Timer,
  Trash2,
  Type,
  Video,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/pill";
import { useServiceStore } from "@/stores/serviceStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { useThemeStore } from "@/stores/themeStore";
import type { ServiceItem } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const addItems = [
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

const itemColors: Record<string, string> = {
  countdown: "bg-orange-500",
  song: "bg-purple-500",
  scripture: "bg-sky-500",
  announcement: "bg-blue-500",
  sermon_note: "bg-emerald-500",
  video: "bg-red-500",
  image: "bg-amber-500",
  logo: "bg-slate-500",
  blackout: "bg-gray-700",
  blank: "bg-gray-600",
};

function SortableRow({
  item,
  index,
  selected,
  onAir,
  onSelect,
  onDelete,
  onGoLive,
}: {
  item: ServiceItem;
  index: number;
  selected: boolean;
  onAir: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
  onGoLive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

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
        selected ? "bg-blue-950/20 border-l-2 border-l-[var(--color-primary)]" : "hover:bg-[var(--color-panel-hover)]",
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
      <span className="w-5 text-[11px] font-mono text-[var(--color-subtle)]">{String(index + 1).padStart(2, "0")}</span>
      <div className={cn("h-8 w-1 rounded-full", itemColors[item.item_type] ?? "bg-gray-500")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-[11px] capitalize text-[var(--color-subtle)]">{item.item_type.replace("_", " ")}</p>
      </div>
      {onAir ? (
        <StatusBadge variant="live">On air</StatusBadge>
      ) : selected ? (
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
  const { themeRevision } = useThemeStore();
  const program = usePresentationStore((s) => s.program);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const isBlackout = program?.type === "blackout";

  const [scriptureRef, setScriptureRef] = useState("Romans 8:28-30");
  const [newTitle, setNewTitle] = useState("Sunday Morning Service");

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
    if (selectedItem) void store.previewActiveItem();
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

  const itemCount = store.activePlan?.items.length ?? 0;

  useEffect(() => {
    useLiveNavigationStore.getState().register({
      onPrev: () => void store.prevItem(),
      onNext: () => void store.nextItem(),
      canPrev: itemIndex > 0,
      canNext: itemIndex >= 0 && itemIndex < itemCount - 1,
      label: "Service plan",
      beforeGoLive: async () => {
        const plan = useServiceStore.getState().activePlan;
        const itemId = useServiceStore.getState().activeItemId;
        const item = plan?.items.find((i) => i.id === itemId);
        if (item) {
          const { previewServiceItem } = await import("@/lib/serviceLive");
          const { useThemeStore } = await import("@/stores/themeStore");
          await previewServiceItem(item, useThemeStore.getState().activeTheme);
        }
      },
    });
    return () => useLiveNavigationStore.getState().unregister();
  }, [store, itemIndex, itemCount]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!store.activePlan) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = store.activePlan.items.findIndex((item) => item.id === active.id);
    const newIndex = store.activePlan.items.findIndex((item) => item.id === over.id);
    void store.reorderItems(arrayMove(store.activePlan.items, oldIndex, newIndex).map((item) => item.id));
  };

  const handleAddItem = async (type: string, label: string) => {
    if (!store.activePlan) await store.createPlan(newTitle);
    if (type === "scripture") {
      await store.addItem(type, scriptureRef, JSON.stringify({ reference: scriptureRef }));
    } else {
      await store.addItem(type, label);
    }
  };

  const saveScriptureRef = () => {
    if (!selectedItem || selectedItem.item_type !== "scripture") return;
    void store.updateItem(selectedItem.id, {
      title: scriptureRef,
      contentJson: JSON.stringify({ reference: scriptureRef }),
    });
  };

  const isLive = liveFollow && program && !isBlackout;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={["Library", store.activePlan?.title ?? "Service plan", selectedItem?.title ?? "No item"]}
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
              Build your service run sheet. Items you select here preview everywhere — Bible Search, projector, and
              live controls stay in sync.
            </p>
          </div>
          <div className="p-3">
            <p className="section-label mb-2">Add to plan</p>
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
          </div>
          <div className="border-t border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Templates</p>
            {["Sunday AM", "Midweek", "Funeral", "Youth"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void store.createPlan(t)}
                className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-panel)]"
              >
                <Calendar className="h-3 w-3" />
                {t}
              </button>
            ))}
          </div>
          <div className="mt-auto border-t border-[var(--color-border)] p-3">
            <p className="section-label mb-2">Plans</p>
            <div className="max-h-32 space-y-1 overflow-y-auto">
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
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-background)]">
          {store.activePlan ? (
            <>
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <h2 className="text-base font-semibold">{store.activePlan.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-subtle)]">
                  <span>{store.activePlan.items.length} items</span>
                  {itemIndex >= 0 && (
                    <span>
                      Item {itemIndex + 1} of {store.activePlan.items.length}
                    </span>
                  )}
                  <span className="text-[var(--color-muted-foreground)]">Double-click a row to go live</span>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={store.activePlan.items.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {store.activePlan.items.map((item, index) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        index={index}
                        selected={store.activeItemId === item.id}
                        onAir={isLive === true && store.activeItemId === item.id}
                        onSelect={() => void store.selectItem(item.id)}
                        onDelete={(id) => void store.removeItem(id)}
                        onGoLive={() => {
                          void store.selectItem(item.id).then(() => store.goLiveActiveItem());
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {store.activePlan.items.length === 0 && (
                  <div className="m-4 rounded-lg border border-dashed border-[var(--color-border-light)] py-6 text-center text-xs text-[var(--color-subtle)]">
                    Add items from the left panel to build your service order
                  </div>
                )}
              </div>

              {selectedItem && (
                <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Title">
                      <input
                        key={selectedItem.id}
                        defaultValue={selectedItem.title}
                        onBlur={(e) => {
                          if (e.target.value !== selectedItem.title) {
                            void store.updateItem(selectedItem.id, { title: e.target.value });
                          }
                        }}
                        className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                      />
                    </Field>
                    {selectedItem.item_type === "scripture" && (
                      <Field label="Reference">
                        <input
                          value={scriptureRef}
                          onChange={(e) => setScriptureRef(e.target.value)}
                          onBlur={saveScriptureRef}
                          className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                        />
                      </Field>
                    )}
                    <Field label="Operator note">
                      <textarea
                        key={`${selectedItem.id}-notes`}
                        defaultValue={selectedItem.operator_notes ?? ""}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value !== (selectedItem.operator_notes ?? "")) {
                            void store.updateItem(selectedItem.id, { operatorNotes: value });
                          }
                        }}
                        rows={2}
                        className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
                        placeholder="Notes visible to operator only..."
                      />
                    </Field>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">Create or select a service plan to get started</p>
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

function Calendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
