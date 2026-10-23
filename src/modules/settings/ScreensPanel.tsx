import { useEffect } from "react";
import { SCREEN_ROLE_LABELS, type ScreenRole } from "@/lib/screenRoles";
import type { DisplayInfo } from "@/lib/tauri";
import { usePresentationStore } from "@/stores/presentationStore";
import { useScreensStore } from "@/stores/screensStore";

const ROLE_CHOICES: (ScreenRole | "none")[] = ["projector", "side", "stage", "none"];

/** One row per connected display: what it shows during the service. */
export function ScreensPanel() {
  const displays = usePresentationStore((s) => s.displays);
  const syncOutputStatus = usePresentationStore((s) => s.syncOutputStatus);
  const roles = useScreensStore((s) => s.roles);
  const openSide = useScreensStore((s) => s.openSide);
  const error = useScreensStore((s) => s.error);
  const init = useScreensStore((s) => s.init);
  const setRole = useScreensStore((s) => s.setRole);

  useEffect(() => {
    void syncOutputStatus();
    void init();
  }, [init, syncOutputStatus]);

  const hasProjectorChoice = Object.values(roles).includes("projector");

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
        Choose what each screen shows. Copies of the projector open and close with it, so every screen in the room
        always shows the same thing.
        {!hasProjectorChoice && " With no main projector chosen, the largest external screen is used."}
      </p>
      {displays.length === 0 ? (
        <p className="text-[11px] text-[var(--color-subtle)]">No screens detected.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {displays.map((d) => (
            <ScreenRow
              key={d.id}
              display={d}
              role={roles[d.id] ?? "none"}
              showing={openSide.includes(d.id)}
              onChange={(role) => void setRole(d.id, role === "none" ? null : role)}
            />
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-amber-400">{error}</p>}
    </div>
  );
}

function ScreenRow({
  display,
  role,
  showing,
  onChange,
}: {
  display: DisplayInfo;
  role: ScreenRole | "none";
  showing: boolean;
  onChange: (role: ScreenRole | "none") => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-[var(--color-foreground)]">
          {display.name}
          {display.is_primary && <span className="ml-1.5 text-[10px] text-[var(--color-subtle)]">this screen</span>}
        </p>
        <p className="text-[10px] text-[var(--color-subtle)]">
          {display.width}×{display.height}
          {showing && " · showing now"}
        </p>
      </div>
      <select
        aria-label={`Role for ${display.name}`}
        value={role}
        onChange={(e) => onChange(e.target.value as ScreenRole | "none")}
        className="h-8 rounded-md border border-[var(--color-border-light)] bg-[var(--color-surface)] px-2 text-xs"
      >
        {ROLE_CHOICES.map((choice) => (
          <option key={choice} value={choice}>
            {SCREEN_ROLE_LABELS[choice]}
          </option>
        ))}
      </select>
    </li>
  );
}
