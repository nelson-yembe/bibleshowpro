import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  formatItemType,
  isPresentableServiceItem,
  neighborPresentableIndex,
} from "@/lib/serviceItemMeta";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";

export function ServiceQueueStrip() {
  const activePlan = useServiceStore((s) => s.activePlan);
  const activeItemId = useServiceStore((s) => s.activeItemId);
  const selectItem = useServiceStore((s) => s.selectItem);
  const goLiveActiveItem = useServiceStore((s) => s.goLiveActiveItem);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const program = usePresentationStore((s) => s.program);
  const isBlackout = program?.type === "blackout";
  const isLive = liveFollow && program && !isBlackout;

  if (!activePlan) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-light)] px-3 py-2 text-[10px] text-[var(--color-subtle)]">
        No service plan.{" "}
        <Link to="/service" className="text-[var(--color-primary)] hover:underline">
          Create one
        </Link>
      </div>
    );
  }

  const items = activePlan.items;
  const activeIndex = items.findIndex((item) => item.id === activeItemId);
  const active = activeIndex >= 0 ? items[activeIndex] : null;
  const nowItem = (() => {
    if (!isLive) return null;
    if (active && isPresentableServiceItem(active)) return active;
    const prevIdx = neighborPresentableIndex(items, activeIndex, -1);
    return prevIdx >= 0 ? items[prevIdx] ?? null : null;
  })();
  const nextIdx = neighborPresentableIndex(items, activeIndex >= 0 ? activeIndex : -1, 1);
  const nextItem = nextIdx >= 0 ? items[nextIdx] ?? null : null;

  const chips = items.filter(isPresentableServiceItem).slice(0, 6);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="section-label">Run sheet · {activePlan.title}</p>
        <Link to="/service" className="text-[10px] text-[var(--color-primary)] hover:underline">
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div
          className={cn(
            "rounded-md border px-2 py-1.5",
            nowItem ? "border-red-800/40 bg-red-950/20" : "border-[var(--color-border-light)] bg-[var(--color-panel)]",
          )}
        >
          <p className="text-[8px] font-semibold uppercase tracking-wider text-red-300/80">Now</p>
          <p className="truncate text-[10px] font-medium">{nowItem?.title ?? "Standby"}</p>
        </div>
        <button
          type="button"
          disabled={!nextItem}
          onClick={() => {
            if (!nextItem) return;
            void selectItem(nextItem.id).then(() => goLiveActiveItem());
          }}
          className={cn(
            "rounded-md border px-2 py-1.5 text-left",
            nextItem
              ? "border-amber-800/40 bg-amber-950/15 hover:bg-amber-950/25"
              : "border-[var(--color-border-light)] bg-[var(--color-panel)] opacity-50",
          )}
        >
          <p className="text-[8px] font-semibold uppercase tracking-wider text-amber-300/80">Next</p>
          <p className="truncate text-[10px] font-medium">{nextItem?.title ?? "End"}</p>
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {chips.map((item) => {
          const isNow = nowItem?.id === item.id;
          const isNext = nextItem?.id === item.id && !isNow;
          const isSelected = activeItemId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={`${item.title} · ${formatItemType(item.item_type)}`}
              onClick={() => void selectItem(item.id)}
              className={cn(
                "max-w-[110px] truncate rounded-md px-2 py-1 text-[10px] font-medium",
                isNow && "bg-red-950/50 text-red-200 ring-1 ring-red-800/50",
                isNext && !isNow && "bg-amber-950/40 text-amber-200 ring-1 ring-amber-800/40",
                !isNow && !isNext && isSelected && "bg-blue-950/50 text-blue-300 ring-1 ring-blue-800/50",
                !isNow &&
                  !isNext &&
                  !isSelected &&
                  "bg-[var(--color-panel)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              )}
            >
              {item.title}
            </button>
          );
        })}
        {chips.length === 0 && <span className="text-[10px] text-[var(--color-subtle)]">Empty plan</span>}
        {items.filter(isPresentableServiceItem).length > chips.length && (
          <span className="self-center text-[10px] text-[var(--color-subtle)]">
            +{items.filter(isPresentableServiceItem).length - chips.length}
          </span>
        )}
      </div>
    </div>
  );
}
