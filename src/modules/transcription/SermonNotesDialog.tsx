import { open } from "@tauri-apps/plugin-dialog";
import { FileText, X } from "lucide-react";
import { useState } from "react";
import { api, type NotesReference } from "@/lib/tauri";

/**
 * Read the preacher's notes before the service: every reference in them is queued
 * on Live Listen, and heard references the notes hold are trusted more.
 */
export function SermonNotesDialog({
  loadedCount,
  onQueue,
  onClear,
  onClose,
}: {
  /** Passages already loaded from earlier notes. */
  loadedCount: number;
  onQueue: (passages: NotesReference[]) => Promise<number>;
  onClear: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [found, setFound] = useState<NotesReference[] | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const show = (references: NotesReference[], from: string) => {
    setFound(references);
    setSkipped(new Set());
    setSource(from);
    setMessage(references.length === 0 ? `No scripture references found in ${from}.` : null);
  };

  const chooseFile = async () => {
    let picked: string | string[] | null = null;
    try {
      picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Sermon notes", extensions: ["docx", "pdf", "txt", "md"] }],
      });
    } catch {
      setMessage("Opening files needs the desktop app. Paste the notes below instead.");
      return;
    }
    if (typeof picked !== "string") return;
    setBusy(true);
    try {
      show(await api.readSermonNotes(picked), picked.split(/[\\/]/).pop() ?? "the file");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const readPasted = async () => {
    setBusy(true);
    try {
      show(await api.findSermonReferences(text), "the pasted notes");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (reference: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(reference)) next.delete(reference);
      else next.add(reference);
      return next;
    });

  const chosen = (found ?? []).filter((r) => !skipped.has(r.reference));

  const queue = async () => {
    setBusy(true);
    try {
      const queued = await onQueue(chosen);
      if (queued === chosen.length) {
        onClose();
      } else {
        setMessage(`${queued} of ${chosen.length} queued — the rest are not in the active Bible.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="Sermon notes">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[#0f1219] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">Sermon notes</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--color-subtle)] hover:text-[var(--color-foreground)]" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
            Every reference in the notes waits at the bottom of the suggestions, in the order written. When the
            preacher says one of them, it is picked up with high confidence.
          </p>
          <button type="button" disabled={busy} onClick={() => void chooseFile()} className="control-btn w-full justify-center">
            <FileText className="h-3.5 w-3.5" />
            Choose a notes file (.docx, .pdf, .txt)
          </button>
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="…or paste the notes here"
              rows={4}
              className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2 text-[12px]"
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void readPasted()}
              className="control-btn mt-1 text-[11px]"
            >
              Find references
            </button>
          </div>

          {message && <p className="text-[11px] text-amber-400">{message}</p>}

          {found && found.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
                {found.length} in {source}
              </p>
              {found.map((r) => (
                <label key={r.reference} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={!skipped.has(r.reference)}
                    onChange={() => toggle(r.reference)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-[var(--color-foreground)]">{r.reference}</span>
                    <span className="block truncate text-[10px] text-[var(--color-subtle)]" title={r.context}>
                      {r.context}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {loadedCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="control-btn text-[11px]"
            >
              Clear {loadedCount} loaded
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={() => void queue()}
            className="control-btn-primary"
          >
            {chosen.length === 0
              ? "Queue references"
              : chosen.length === 1
                ? "Queue 1 reference"
                : `Queue ${chosen.length} references`}
          </button>
        </div>
      </div>
    </div>
  );
}
