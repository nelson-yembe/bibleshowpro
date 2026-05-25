import { useEffect } from "react";
import { Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HighlightMenuState {
  x: number;
  y: number;
  text: string;
}

interface PreviewHighlightMenuProps {
  menu: HighlightMenuState | null;
  onClose: () => void;
  onHighlight: (text: string) => void;
}

export function PreviewHighlightMenu({ menu, onClose, onHighlight }: PreviewHighlightMenuProps) {
  useEffect(() => {
    if (!menu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menu, onClose]);

  if (!menu) return null;

  const label = menu.text.length > 48 ? `${menu.text.slice(0, 48)}…` : menu.text;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default"
        aria-label="Close highlight menu"
        onClick={onClose}
      />
      <div
        className="fixed z-[61] min-w-[180px] overflow-hidden rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] py-1 shadow-xl"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
            "text-[var(--color-foreground)] hover:bg-[var(--color-panel-hover)]",
          )}
          onClick={() => {
            onHighlight(menu.text);
            onClose();
          }}
        >
          <Highlighter className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
          <span>
            Highlight &ldquo;<span className="font-medium">{label}</span>&rdquo;
          </span>
        </button>
      </div>
    </>
  );
}

export function readPreviewTextSelection(container: HTMLElement | null): string | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !container) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  if (!anchor || !focus) return null;
  if (!container.contains(anchor) && !container.contains(focus)) return null;

  return text;
}
