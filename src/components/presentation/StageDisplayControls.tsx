import { useEffect, useState } from "react";
import { usePresentationStore } from "@/stores/presentationStore";
import { useStageStore } from "@/stores/stageStore";
import { useScreensStore } from "@/stores/screensStore";

const fieldClass =
  "h-7 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";

/** Live dock section: open the stage display on a screen and talk to the platform. */
export function StageDisplayControls() {
  const displays = usePresentationStore((s) => s.displays);
  const open = useStageStore((s) => s.open);
  const displayId = useStageStore((s) => s.displayId);
  const message = useStageStore((s) => s.message);
  const error = useStageStore((s) => s.error);
  const init = useStageStore((s) => s.init);
  const openStage = useStageStore((s) => s.openStage);
  const closeStage = useStageStore((s) => s.closeStage);
  const setRole = useScreensStore((s) => s.setRole);
  const sendMessage = useStageStore((s) => s.sendMessage);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void init();
  }, [init]);

  const send = () => {
    void sendMessage(draft);
    setDraft("");
  };

  return (
    <div className="border-t border-[var(--color-border)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="section-label">Stage display</p>
        <button
          type="button"
          onClick={() => void (open ? closeStage() : openStage())}
          className="rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          {open ? "Close" : "Open"}
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wide text-[var(--color-subtle)]">Screen</span>
        <select
          value={displayId}
          onChange={(e) => void (e.target.value ? setRole(e.target.value, "stage") : displayId && setRole(displayId, null))}
          className={fieldClass}
        >
          <option value="">A window I place myself</option>
          {displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.width}×{d.height}
              {d.is_primary ? " (this screen)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft.trim() && send()}
          placeholder="Message to the platform"
          className={fieldClass}
        />
        <button type="button" disabled={!draft.trim()} onClick={send} className="control-btn shrink-0 text-[10px]">
          Send
        </button>
      </div>
      {message && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200">
          <span className="truncate">Showing: {message}</span>
          <button type="button" onClick={() => void sendMessage("")} className="shrink-0 underline underline-offset-2">
            Clear
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[10px] text-amber-400">{error}</p>}
    </div>
  );
}
