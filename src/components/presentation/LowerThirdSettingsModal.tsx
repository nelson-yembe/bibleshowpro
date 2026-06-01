import { X } from "lucide-react";
import {
  LowerThirdControls,
  type LowerThirdControlState,
} from "@/components/presentation/LowerThirdControls";
import type { LowerThirdStyle } from "@/lib/themeConfig";

interface LowerThirdSettingsModalProps {
  open: boolean;
  onClose: () => void;
  effective: LowerThirdStyle;
  state: LowerThirdControlState;
  onChange: (patch: Partial<LowerThirdControlState & Record<string, unknown>>) => void;
  onShowToggle?: (patch: { showReference?: boolean; showVersion?: boolean; showVerseNumbers?: boolean }) => void;
  showReference?: boolean;
  showVersion?: boolean;
  showVerseNumbers?: boolean;
}

export function LowerThirdSettingsModal({
  open,
  onClose,
  effective,
  state,
  onChange,
  onShowToggle,
  showReference,
  showVersion,
  showVerseNumbers,
}: LowerThirdSettingsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0a0c12] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lower-third-settings-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <div>
            <h2 id="lower-third-settings-title" className="text-sm font-semibold text-[var(--color-foreground)]">
              Lower third settings
            </h2>
            <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
              Templates, layout, stream overlay, and animation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-foreground)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <LowerThirdControls
            effective={effective}
            state={state}
            onChange={onChange}
            onShowToggle={onShowToggle}
            showReference={showReference}
            showVersion={showVersion}
            showVerseNumbers={showVerseNumbers}
          />
        </div>

        <div className="flex shrink-0 justify-end border-t border-[var(--color-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_LABELS: Record<LowerThirdStyle["template"], string> = {
  worship: "Worship",
  classic: "Classic",
  broadcast: "TV",
  glass: "Glass",
  minimal: "Minimal",
  "line-only": "Line",
};

export function lowerThirdSummaryChips(lt: LowerThirdStyle): string[] {
  const chips = [
    TEMPLATE_LABELS[lt.template] ?? lt.template,
    lt.horizontalAlign.charAt(0).toUpperCase() + lt.horizontalAlign.slice(1),
  ];
  if (lt.transparentOutput) chips.push("Transparent overlay");
  if (lt.backdropBlur) chips.push("Glass blur");
  return chips;
}
