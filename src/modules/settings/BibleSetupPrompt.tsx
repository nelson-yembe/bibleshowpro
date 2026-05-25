import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { api } from "@/lib/tauri";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";

export function BibleSetupPrompt() {
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { importProgress, loadCatalog } = useBibleVersionsStore();

  useEffect(() => {
    void (async () => {
      const status = await api.getBibleSetupStatus();
      if (status.needs_full_bible && !dismissed) {
        setOpen(true);
      }
    })();
  }, [dismissed]);

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      await api.installCoreBiblePackages();
      await loadCatalog();
      setOpen(false);
    } finally {
      setInstalling(false);
    }
  };

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[#0a0c12]/95 p-4 shadow-2xl backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Bible packages required</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
              Download KJV, Basic English, and World English Bible so every passage has text. You can
              keep using the app while this installs.
            </p>
            {importProgress?.message && (
              <p className="mt-2 text-[11px] text-[var(--color-subtle)]">{importProgress.message}</p>
            )}
          </div>
          {!installing && (
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                setOpen(false);
              }}
              className="shrink-0 text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-50"
          >
            {installing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {installing ? "Installing…" : "Install now"}
          </button>
          {!installing && (
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                setOpen(false);
              }}
              className="h-8 rounded-md px-3 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
