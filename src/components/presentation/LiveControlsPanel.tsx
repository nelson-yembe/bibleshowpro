import { useMemo } from "react";
import { Zap } from "lucide-react";
import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import { ServiceQueueStrip } from "@/components/presentation/ServiceQueueStrip";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import { buildSlidesFromSong } from "@/lib/songTypes";
import { cn } from "@/lib/utils";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useSongStore } from "@/stores/songStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";

type ControlAction = "clear" | "undo" | "blackout" | "logo" | "freeze";

interface ControlButton {
  id: string;
  label: string;
  action?: ControlAction;
  onClick?: () => void;
  disabled?: boolean;
}

const sourceLabels = {
  bible: "Bible",
  service: "Service plan",
  media: "Media",
  song: "Song lyrics",
  transcription: "Live listen",
} as const;

interface LiveControlsPanelProps {
  displayOptions?: Partial<DisplayOptions>;
}

function formatProgramLabel(scene: ReturnType<typeof usePresentationStore.getState>["program"]) {
  if (!scene || scene.type === "blackout") return "Nothing on program";
  if (scene.type === "song_lyrics") {
    const title = scene.content.title ?? "Song";
    const line = scene.content.body?.split("\n")[0]?.slice(0, 48);
    return line ? `${title} · ${line}${(scene.content.body?.length ?? 0) > 48 ? "…" : ""}` : title;
  }
  if (scene.content.title && !scene.content.reference) {
    return scene.content.title;
  }
  const ref = scene.content.reference ?? "";
  const abbr = scene.content.translationAbbr;
  return abbr ? `${ref} · ${abbr}` : ref || scene.content.title || "Ready";
}

export function LiveControlsPanel({ displayOptions }: LiveControlsPanelProps) {
  const {
    program,
    preview,
    frozen,
    liveFollow,
    previewSource,
    goLive,
    undo,
    clear,
    blackout,
    showLogo,
    freeze,
    outputOpen,
    displays,
    activeDisplay,
    openOutput,
    closeOutput,
    refreshOutput,
  } = usePresentationStore();

  const handlers = useLiveNavigationStore((s) => s.handlers);
  const activeSong = useSongStore((s) => s.activeSong);
  const songSlideIndex = useSongStore((s) => s.slideIndex);
  const songDirty = useSongStore((s) => s.dirty);
  const linesPerSlide = useSongStore((s) => s.linesPerSlide);

  const songSlides = useMemo(() => {
    if (!activeSong) return [];
    const computed = buildSlidesFromSong(activeSong, linesPerSlide);
    if (computed.length > 0) return computed;
    if (!songDirty && activeSong.slides.length > 0) return activeSong.slides;
    return computed;
  }, [activeSong, linesPerSlide, songDirty]);

  const songSlide = songSlides[songSlideIndex] ?? songSlides[0] ?? null;
  const songNextSlide = songSlides[songSlideIndex + 1] ?? null;

  const isBlackout = program?.type === "blackout";
  const isOnAir = liveFollow && program && !isBlackout;
  const autoGoLive = useTranscriptionStore((s) => s.autoGoLive);
  const transcriptionAutoLive = previewSource === "transcription" && autoGoLive;
  const isSongLive = previewSource === "song" && songSlides.length > 0;
  const programLabel = formatProgramLabel(program);
  const externalDisplays = displays.filter((display) => !display.is_primary);

  const buttons: ControlButton[] = [
    {
      id: "prev",
      label: "PREV",
      onClick: handlers?.onPrev,
      disabled: !handlers?.canPrev || !handlers?.onPrev,
    },
    {
      id: "next",
      label: "NEXT",
      onClick: handlers?.onNext,
      disabled: !handlers?.canNext || !handlers?.onNext,
    },
    { id: "clear", label: "CLEAR", action: "clear" },
    { id: "undo", label: "UNDO", action: "undo" },
    { id: "black", label: "BLACK", action: "blackout" },
    { id: "logo", label: "LOGO", action: "logo" },
    { id: "freeze", label: "FREEZE", action: "freeze" },
  ];

  const handleControl = (btn: ControlButton) => {
    if (btn.onClick) {
      btn.onClick();
      return;
    }
    if (btn.action === "clear") clear();
    if (btn.action === "undo") undo();
    if (btn.action === "blackout") void blackout();
    if (btn.action === "logo") void showLogo();
    if (btn.action === "freeze") freeze();
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[#0a0c12]">
      <div className="border-b border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="section-label">Live</span>
          {isOnAir ? (
            <span className="live-badge">● ON AIR</span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
              Standby
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border-2 border-red-900/40 bg-black">
          <p className="border-b border-red-900/30 px-2 py-1 text-[9px] uppercase tracking-wider text-red-300/80">
            Live
            {previewSource ? ` · ${sourceLabels[previewSource]}` : ""}
          </p>
          <div className="h-[200px]">
            <SceneRenderer scene={program} compact displayOptions={displayOptions} label="Logo / standby" />
          </div>
          <p className="truncate px-2 py-1.5 text-[10px] text-[var(--color-muted-foreground)]">{programLabel}</p>
        </div>

        {handlers?.label && (
          <p className="mt-2 text-[10px] text-[var(--color-subtle)]">
            {handlers.label}
            {isSongLive && isOnAir ? " · NEXT/PREV updates live output" : " · arrow keys to step"}
          </p>
        )}

        {isSongLive && (
          <div className="mt-2 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] p-2.5">
            <p className="section-label mb-1.5">Foldback</p>
            <div className="space-y-2">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-blue-300/80">
                  Now · {songSlide?.section_label ?? "—"} ({songSlideIndex + 1}/{songSlides.length})
                </p>
                <p className="line-clamp-3 whitespace-pre-line text-[11px] leading-snug text-[var(--color-foreground)]">
                  {songSlide?.text ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-amber-300/80">
                  Next · {songNextSlide?.section_label ?? "End"}
                </p>
                <p className="line-clamp-2 whitespace-pre-line text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                  {songNextSlide?.text ?? "—"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <button
          type="button"
          className="go-live-btn"
          onClick={() => void goLive()}
          disabled={!preview || transcriptionAutoLive}
        >
          <Zap className="h-4 w-4 fill-current" />
          GO LIVE
          <span className="ml-auto rounded bg-black/25 px-2 py-0.5 text-[10px] font-normal tracking-wide">SPACE</span>
        </button>
        <p className="text-center text-[10px] text-[var(--color-subtle)]">
          {transcriptionAutoLive
            ? "Auto live is on — Live Listen sends scripture directly to projection"
            : preview
              ? "Send preview to projection"
              : "Stage content in the center panel first"}
        </p>

        <div className="grid grid-cols-4 gap-2">
          {buttons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => handleControl(btn)}
              disabled={btn.disabled}
              className={cn(
                "control-grid-btn min-h-[48px]",
                btn.disabled && "cursor-not-allowed opacity-35",
                btn.action === "blackout" && isBlackout && "control-grid-btn-active",
                btn.action === "freeze" && frozen && "control-grid-btn-active",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] p-4">
        <ServiceQueueStrip />
      </div>

      <div className="mt-auto border-t border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="section-label">Projector</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void (outputOpen ? refreshOutput() : openOutput())}
              className="rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            >
              {outputOpen ? "Refresh" : "Open"}
            </button>
            {outputOpen && (
              <button
                type="button"
                onClick={() => void closeOutput()}
                className="rounded-md border border-[var(--color-border-light)] px-2 py-1 text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                Close
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-[var(--color-panel)] px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
              {activeDisplay?.name ?? "Main output"}
            </span>
            <span
              className={cn(
                "text-[10px] font-bold tracking-wider",
                outputOpen ? "text-red-400" : externalDisplays.length > 0 ? "text-amber-400" : "text-[var(--color-subtle)]",
              )}
            >
              {outputOpen ? "OPEN" : externalDisplays.length > 0 ? "READY" : "CLOSED"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
            {activeDisplay
              ? `${activeDisplay.width}×${activeDisplay.height}`
              : externalDisplays.length > 0
                ? `${externalDisplays.length} external display(s) detected`
                : "Opens when you go live"}
          </p>
        </div>
      </div>
    </aside>
  );
}
