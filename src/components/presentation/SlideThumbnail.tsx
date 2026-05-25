import { cn } from "@/lib/utils";
import type { VerseResult } from "@/lib/tauri";

interface SlideThumbnailProps {
  index: number;
  group: VerseResult[];
  active?: boolean;
  onClick?: () => void;
}

export function SlideThumbnail({ index, group, active, onClick }: SlideThumbnailProps) {
  const snippet = group.map((v) => v.text).join(" ").slice(0, 60);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[52px] w-[88px] shrink-0 flex-col overflow-hidden rounded-md border bg-black text-left transition-colors",
        active
          ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/50"
          : "border-[var(--color-border-light)] hover:border-[var(--color-border)]",
      )}
    >
      <div className="flex items-center justify-between bg-[#121620] px-2 py-0.5">
        <span className={cn("text-[10px] font-bold", active ? "text-blue-300" : "text-[var(--color-subtle)]")}>
          {index + 1}
        </span>
      </div>
      <div className="flex-1 px-1.5 py-1">
        <p className="line-clamp-2 text-[8px] leading-tight text-slate-500">{snippet || "…"}</p>
      </div>
    </button>
  );
}
