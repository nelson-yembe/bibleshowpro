import { useState, useEffect } from "react";
import {
  Download,
  Upload,
  Antenna,
  BookOpen,
  DatabaseBackup,
  Info,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { BibleVersionsPanel } from "@/modules/settings/BibleVersionsPanel";
import { NdiOutputPanel } from "@/modules/settings/NdiOutputPanel";
import { CollapsibleSection, type CollapsibleSignal } from "@/components/ui/CollapsibleSection";
import { StatusBadge } from "@/components/ui/pill";
import { downloadTextFile } from "@/lib/utils";
import { api } from "@/lib/tauri";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";
import { useNdiStore } from "@/stores/ndiStore";

export function SettingsPage() {
  const [restoreJson, setRestoreJson] = useState("");
  const [signal, setSignal] = useState<CollapsibleSignal | undefined>(undefined);
  const loadCatalog = useBibleVersionsStore((s) => s.loadCatalog);
  const ndiRunning = useNdiStore((s) => s.status?.running ?? false);
  const ndiSaving = useNdiStore((s) => s.saving);
  const installedCount = useBibleVersionsStore(
    (s) => s.catalog.filter((c) => c.installed && c.verse_count > 1000).length,
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const setAll = (open: boolean) =>
    setSignal((prev) => ({ open, nonce: (prev?.nonce ?? 0) + 1 }));

  return (
    <div className="flex h-full flex-col">
      <TopBar breadcrumbs={["Settings"]} />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="flex items-center justify-end gap-2 pb-1">
            <button
              type="button"
              onClick={() => setAll(true)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-[var(--color-subtle)] transition-colors hover:text-[var(--color-foreground)]"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-[var(--color-subtle)] transition-colors hover:text-[var(--color-foreground)]"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              Collapse all
            </button>
          </div>

          <CollapsibleSection
            id="ndi"
            title="NDI Output"
            description="Program & preview feeds over the network"
            icon={<Antenna className="h-4 w-4" />}
            signal={signal}
            headerRight={
              <span className="flex items-center gap-2">
                {ndiSaving ? <StatusBadge variant="draft">Saving…</StatusBadge> : null}
                {ndiRunning ? (
                  <StatusBadge variant="live">● LIVE</StatusBadge>
                ) : (
                  <StatusBadge variant="draft">Off</StatusBadge>
                )}
              </span>
            }
          >
            <NdiOutputPanel embedded />
          </CollapsibleSection>

          <CollapsibleSection
            id="bible-versions"
            title="Bible Versions"
            description="Download or import translations"
            icon={<BookOpen className="h-4 w-4" />}
            defaultOpen
            signal={signal}
            headerRight={
              installedCount > 0 ? (
                <StatusBadge variant="draft">{installedCount} installed</StatusBadge>
              ) : null
            }
          >
            <BibleVersionsPanel embedded />
          </CollapsibleSection>

          <CollapsibleSection
            id="backup"
            title="Backup & Restore"
            description="Export or restore service plans, themes, and media"
            icon={<DatabaseBackup className="h-4 w-4" />}
            signal={signal}
          >
            <div className="flex flex-wrap gap-2">
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
          </CollapsibleSection>

          <CollapsibleSection
            id="about"
            title="About"
            description="Version & application info"
            icon={<Info className="h-4 w-4" />}
            signal={signal}
          >
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Bible Show Pro v1.1.0 — Desktop presentation platform for churches.
            </p>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
