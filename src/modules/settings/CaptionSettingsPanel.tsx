import { CAPTION_MAX_LINES, CAPTION_MIN_LINES, CAPTION_STALE_MS } from "@/lib/captions";
import { useCaptionStore } from "@/stores/captionStore";

const selectClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

/** How live captions look on the output. Turning them on and off stays on Live Listen. */
export function CaptionSettingsPanel() {
  const settings = useCaptionStore((s) => s.settings);
  const update = useCaptionStore((s) => s.updateSettings);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Show captions on the output screen
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className={labelClass}>Position</span>
          <select
            value={settings.position}
            onChange={(e) => update({ position: e.target.value === "top" ? "top" : "bottom" })}
            className={selectClass}
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Lines</span>
          <select
            value={String(settings.maxLines)}
            onChange={(e) => update({ maxLines: Number(e.target.value) })}
            className={selectClass}
          >
            {Array.from({ length: CAPTION_MAX_LINES - CAPTION_MIN_LINES + 1 }, (_, i) => CAPTION_MIN_LINES + i).map(
              (n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 line" : `${n} lines`}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Text size</span>
          <select
            value={String(settings.fontScale)}
            onChange={(e) => update({ fontScale: Number(e.target.value) })}
            className={selectClass}
          >
            <option value="0.8">Small</option>
            <option value="1">Normal</option>
            <option value="1.3">Large</option>
            <option value="1.6">Extra large</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] leading-snug text-[var(--color-subtle)]">
        Captions draw on the output window, so they are part of the NDI feed. They clear themselves after{" "}
        {Math.round(CAPTION_STALE_MS / 1000)}s without new speech, and stop when you pause or stop listening.
      </p>
    </div>
  );
}
