import { useEffect } from "react";
import { useBibleStore } from "@/stores/bibleStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useServiceStore } from "@/stores/serviceStore";
import { useNdiStore } from "@/stores/ndiStore";

interface StatusItem {
  label: string;
  state: "green" | "yellow" | "red" | "gray";
}

const sourceLabels = {
  bible: "Bible",
  service: "Service",
  media: "Media",
  song: "Song",
  transcription: "Listen",
} as const;

export function StatusBar() {
  const { translations, loadTranslations } = useBibleStore();
  const outputOpen = usePresentationStore((s) => s.outputOpen);
  const activeDisplay = usePresentationStore((s) => s.activeDisplay);
  const displays = usePresentationStore((s) => s.displays);
  const program = usePresentationStore((s) => s.program);
  const previewSource = usePresentationStore((s) => s.previewSource);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const activePlan = useServiceStore((s) => s.activePlan);
  const activeItemId = useServiceStore((s) => s.activeItemId);
  const ndiRunning = useNdiStore((s) => s.status?.running);

  useEffect(() => {
    void loadTranslations();
  }, [loadTranslations]);

  const isLive = liveFollow && program?.type !== "blackout" && program !== null;
  const versionCount = translations.length;
  const activeServiceItem = activePlan?.items.find((item) => item.id === activeItemId);
  const serviceLabel = activePlan
    ? activeServiceItem
      ? `Plan · ${activePlan.title} · ${activeServiceItem.title}`
      : `Plan · ${activePlan.title}`
    : "Plan · none";
  const sourceLabel = previewSource ? sourceLabels[previewSource] : "None";
  const externalDisplays = displays.filter((display) => !display.is_primary);
  const projectorLabel = outputOpen
    ? activeDisplay
      ? `Output · ${activeDisplay.name}`
      : "Output · open"
    : externalDisplays.length > 0
      ? `Output · ${externalDisplays.length} display(s)`
      : "Output · closed";

  const items: StatusItem[] = [
    { label: `Bible · ${versionCount} versions`, state: versionCount > 0 ? "green" : "yellow" },
    { label: serviceLabel, state: activePlan ? "green" : "gray" },
    { label: `Preview · ${sourceLabel}`, state: previewSource ? "green" : "gray" },
    { label: projectorLabel, state: outputOpen ? "green" : externalDisplays.length > 0 ? "yellow" : "gray" },
    { label: ndiRunning ? "NDI · live" : "NDI · off", state: ndiRunning ? "green" : "gray" },
    { label: isLive ? "Live · on air" : "Live · standby", state: isLive ? "green" : "yellow" },
  ];

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[11px] text-[var(--color-muted-foreground)]">
      <div className="flex items-center gap-4 overflow-x-auto">
        {items.map((item) => (
          <span key={item.label} className="flex shrink-0 items-center gap-1.5">
            <span className={`status-dot status-dot-${item.state}`} />
            {item.label}
          </span>
        ))}
      </div>
      <span className="shrink-0 text-[var(--color-subtle)]">v1.1.0</span>
    </footer>
  );
}
