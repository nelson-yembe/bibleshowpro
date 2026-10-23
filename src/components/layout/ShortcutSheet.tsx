import { useEffect } from "react";
import { create } from "zustand";
import { SHORTCUT_SHEET } from "@/lib/liveShortcuts";

interface ShortcutSheetState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useShortcutSheetStore = create<ShortcutSheetState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

/** Every live key on one card, opened with "?" from anywhere. */
export function ShortcutSheet() {
  const open = useShortcutSheetStore((s) => s.open);
  const close = useShortcutSheetStore((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[#0f1219] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Keyboard shortcuts</h2>
        <table className="w-full text-[12px]">
          <tbody>
            {SHORTCUT_SHEET.map((row) => (
              <tr key={row.action} className="border-t border-[var(--color-border-light)]">
                <td className="whitespace-nowrap py-2 pr-4">
                  {row.keys.map((k) => (
                    <kbd
                      key={k}
                      className="mr-1 inline-block min-w-[1.6rem] rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] px-1.5 py-0.5 text-center font-mono text-[11px] text-[var(--color-foreground)]"
                    >
                      {k}
                    </kbd>
                  ))}
                </td>
                <td className="py-2 pr-3 text-[var(--color-foreground)]">{row.action}</td>
                <td className="py-2 text-right text-[10px] text-[var(--color-subtle)]">{row.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-[var(--color-subtle)]">Keys are ignored while you type in a field. Press Esc to close.</p>
      </div>
    </div>
  );
}
