import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useServiceStore } from "@/stores/serviceStore";

export function ServiceQueueStrip() {
  const activePlan = useServiceStore((s) => s.activePlan);
  const activeItemId = useServiceStore((s) => s.activeItemId);
  const selectItem = useServiceStore((s) => s.selectItem);

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

  const items = activePlan.items.slice(0, 8);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="section-label">Service · {activePlan.title}</p>
        <Link to="/service" className="text-[10px] text-[var(--color-primary)] hover:underline">
          Edit
        </Link>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            title={item.title}
            onClick={() => void selectItem(item.id)}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium",
              activeItemId === item.id
                ? "bg-blue-950/50 text-blue-300 ring-1 ring-blue-800/50"
                : "bg-[var(--color-panel)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {String(index + 1).padStart(2, "0")}
          </button>
        ))}
        {activePlan.items.length === 0 && (
          <span className="text-[10px] text-[var(--color-subtle)]">Empty plan</span>
        )}
        {activePlan.items.length > items.length && (
          <span className="self-center text-[10px] text-[var(--color-subtle)]">
            +{activePlan.items.length - items.length}
          </span>
        )}
      </div>
    </div>
  );
}
