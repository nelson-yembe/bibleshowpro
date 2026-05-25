import { useRef, useState } from "react";
import { Download, Star, Trash2, Upload } from "lucide-react";
import { groupCatalogByLanguage } from "@/lib/bibleLanguages";
import { cn } from "@/lib/utils";
import { useBibleVersionsStore } from "@/stores/bibleVersionsStore";
import type { CatalogEntryView } from "@/lib/tauri";

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

export function BibleVersionsPanel() {
  const {
    catalog,
    importing,
    importProgress,
    loadCatalog,
    downloadTranslation,
    importFromFile,
    deleteTranslation,
    setDefaultTranslation,
  } = useBibleVersionsStore();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const installed = catalog.filter((c) => c.installed && c.verse_count > 1000);
  const availableDownload = catalog.filter(
    (c) => c.install_method === "download" && (!c.installed || c.verse_count <= 1000),
  );
  const licensedCatalog = catalog.filter((c) => c.install_method === "import");
  const downloadGroups = groupCatalogByLanguage(availableDownload);

  const handleDownload = async (entry: CatalogEntryView) => {
    setError(null);
    setMessage(null);
    try {
      const msg = await downloadTranslation(entry.id);
      setMessage(msg);
      await loadCatalog();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleImportFile = async (file: File) => {
    setError(null);
    setMessage(null);
    try {
      const json = await file.text();
      const msg = await importFromFile(json);
      setMessage(msg);
      await loadCatalog();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="panel p-5">
      <h2 className="text-sm font-semibold">Bible Versions</h2>
      <p className="mt-1 text-xs text-[var(--color-subtle)]">
        Download public-domain translations or import licensed Bibles from a JSON file.
      </p>

      {(importing || importProgress) && (
        <div className="mt-4 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3">
          <p className="text-xs font-medium text-[var(--color-foreground)]">
            {importProgress?.message ?? "Working…"}
          </p>
          {importProgress && importProgress.total > 1 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel)]">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{
                  width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {message && <p className="mt-3 text-xs text-emerald-400">{message}</p>}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {installed.length > 0 && (
        <div className="mt-4">
          <p className="section-label mb-2">Installed</p>
          <div className="space-y-2">
            {installed.map((entry) => (
              <VersionRow
                key={entry.id}
                entry={entry}
                onSetDefault={() => void setDefaultTranslation(entry.id)}
                onDelete={entry.id === "kjv" ? undefined : () => void deleteTranslation(entry.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="section-label mb-2">Available to download</p>
        <button
          type="button"
          disabled={importing}
          onClick={async () => {
            setError(null);
            setMessage(null);
            try {
              const msg = await useBibleVersionsStore.getState().installCorePackages();
              setMessage(msg || "Core packages installed.");
              await loadCatalog();
            } catch (e) {
              setError(String(e));
            }
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Install all free packages (KJV, BBE, WEB)
        </button>
        <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
          {downloadGroups.map((group) => (
            <div key={group.language}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <DownloadRow
                    key={entry.id}
                    entry={entry}
                    importing={importing}
                    onDownload={() => void handleDownload(entry)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="section-label mb-2">Import licensed translation</p>
        <p className="mb-2 text-[10px] leading-relaxed text-[var(--color-subtle)]">
          Modern translations (ESV, NIV, MSG, The Passion Translation, etc.) require your own licensed
          JSON export in Bible Show Pro format. Use the sample at{" "}
          <code className="text-[var(--color-foreground)]">database/seed/kjv-sample.json</code> as a
          template.
        </p>
        {licensedCatalog.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {licensedCatalog.map((entry) => (
              <span
                key={entry.id}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[9px] font-semibold",
                  entry.installed && entry.verse_count > 1000
                    ? "border-emerald-500/40 text-emerald-400"
                    : "border-[var(--color-border-light)] text-[var(--color-subtle)]",
                )}
                title={entry.name}
              >
                {entry.abbreviation}
              </span>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-[var(--color-border-light)] px-4 py-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <Upload className="h-3.5 w-3.5" />
          Import JSON file…
        </button>
      </div>
    </div>
  );
}

function DownloadRow({
  entry,
  importing,
  onDownload,
}: {
  entry: CatalogEntryView;
  importing: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold">
          {entry.abbreviation} · {entry.name}
        </p>
        <p className="text-[10px] text-[var(--color-subtle)]">
          {entry.license === "public-domain" ? "Public domain" : entry.license}
          {formatSize(entry.size_bytes) ? ` · ${formatSize(entry.size_bytes)}` : ""}
          {entry.verse_count > 0 && entry.verse_count <= 1000
            ? ` · partial (${entry.verse_count} verses)`
            : ""}
        </p>
      </div>
      <button
        type="button"
        disabled={importing}
        onClick={onDownload}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
      >
        <Download className="h-3 w-3" />
        {entry.verse_count > 0 && entry.verse_count <= 1000 ? "Update" : "Download"}
      </button>
    </div>
  );
}

function VersionRow({
  entry,
  onSetDefault,
  onDelete,
}: {
  entry: CatalogEntryView;
  onSetDefault: () => void;
  onDelete?: () => void;
}) {
  const isFull = entry.verse_count >= 30_000;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold">
            {entry.abbreviation} · {entry.name}
          </p>
          {entry.is_default && (
            <span className="rounded bg-[var(--color-primary)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-primary)]">
              DEFAULT
            </span>
          )}
        </div>
        <p className={cn("text-[10px]", isFull ? "text-[var(--color-subtle)]" : "text-amber-400")}>
          {isFull
            ? `${entry.verse_count.toLocaleString()} verses · ${entry.copyright}`
            : `Incomplete (${entry.verse_count} verses) — download again for full Bible`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!entry.is_default && (
          <button
            type="button"
            onClick={onSetDefault}
            title="Set as default"
            className="rounded p-1.5 text-[var(--color-subtle)] hover:text-[var(--color-primary)]"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Remove"
            className="rounded p-1.5 text-[var(--color-subtle)] hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
