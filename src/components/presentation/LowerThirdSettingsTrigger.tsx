import { SlidersHorizontal } from "lucide-react";
import { lowerThirdSummaryChips } from "@/components/presentation/LowerThirdSettingsModal";
import type { LowerThirdStyle } from "@/lib/themeConfig";
import { cn } from "@/lib/utils";

interface LowerThirdSettingsTriggerProps {
  effective: LowerThirdStyle;
  onOpen: () => void;
  className?: string;
}

export function LowerThirdSettingsTrigger({ effective, onOpen, className }: LowerThirdSettingsTriggerProps) {
  const chips = lowerThirdSummaryChips(effective);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)]/60 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted-foreground)]"
          >
            {chip}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-foreground)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-primary)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Lower third settings
      </button>
    </div>
  );
}
