import { useState, useEffect } from "react";
import { Download, Upload } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BibleVersionsPanel } from "@/modules/settings/BibleVersionsPanel";
import { NdiOutputPanel } from "@/modules/settings/NdiOutputPanel";
import { downloadTextFile } from "@/lib/utils";
import { api } from "@/lib/tauri";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";

export function SettingsPage() {
  const [restoreJson, setRestoreJson] = useState("");
  const loadCatalog = useBibleVersionsStore((s) => s.loadCatalog);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumbs={["Settings"]} />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <NdiOutputPanel />
          <BibleVersionsPanel />

          <div className="panel p-5">            <h2 className="text-sm font-semibold">Backup & Restore</h2>
            <p className="mt-1 text-xs text-[var(--color-subtle)]">
              Export all service plans, themes, and media metadata to a portable backup file.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const backup = await api.createBackup();
                  downloadTextFile(`bible-show-pro-backup-${Date.now()}.json`, backup);
                }}
                className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Export Full Backup
              </button>
            </div>
            <textarea
              placeholder="Paste backup JSON to restore..."
              value={restoreJson}
              onChange={(e) => setRestoreJson(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={async () => {
                await api.restoreBackup(restoreJson);
                setRestoreJson("");
              }}
              className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Restore Backup
            </button>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold">About</h2>
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Bible Show Pro v1.1.0 — Desktop presentation platform for churches.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
