import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Broadcast an expand/collapse-all instruction to every section at once. */
export interface CollapsibleSignal {
  open: boolean;
  /** Bump this to re-apply `open` even if the value is unchanged. */
  nonce: number;
}

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Right-aligned slot in the header (e.g. a status badge). */
  headerRight?: ReactNode;
  defaultOpen?: boolean;
  /**
   * Stable id used to remember the open/closed state across sessions.
   * Omit to make the section ephemeral.
   */
  id?: string;
  /** External expand/collapse-all instruction from the parent page. */
  signal?: CollapsibleSignal;
  /** Tighter spacing for sections nested inside another section. */
  dense?: boolean;
  children: ReactNode;
}

const STORAGE_PREFIX = "bsp-collapsible:";

function loadPersisted(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function CollapsibleSection({
  title,
  description,
  icon,
  headerRight,
  defaultOpen = false,
  id,
  signal,
  dense = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => loadPersisted(id, defaultOpen));

  // Persist whenever the state changes.
  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + id, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [id, open]);

  // Apply expand/collapse-all instructions from the parent.
  useEffect(() => {
    if (signal) setOpen(signal.open);
    // Only react to a new instruction (nonce), not to local toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal?.nonce]);

  return (
    <div className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left transition-colors hover:bg-white/[0.02]",
          dense ? "px-4 py-3" : "px-5 py-4",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ? <span className="shrink-0 text-[var(--color-primary)]">{icon}</span> : null}
          <span className="min-w-0">
            <span className={cn("block font-semibold", dense ? "text-xs" : "text-sm")}>{title}</span>
            {description ? (
              <span className="mt-0.5 block truncate text-[11px] text-[var(--color-subtle)]">
                {description}
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {headerRight}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--color-subtle)] transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "border-t border-[var(--color-border-light)]",
              dense ? "px-4 py-3" : "px-5 py-4",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
