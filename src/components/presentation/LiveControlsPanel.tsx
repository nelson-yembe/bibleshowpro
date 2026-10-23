import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { SceneRenderer } from "@/components/presentation/SceneRenderer";
import { ServiceQueueStrip } from "@/components/presentation/ServiceQueueStrip";
import { StageDisplayControls } from "@/components/presentation/StageDisplayControls";
import { CountdownPlaybackControls } from "@/components/presentation/CountdownPlaybackControls";
import { VideoPlaybackControls } from "@/components/presentation/VideoPlaybackControls";
import type { DisplayOptions } from "@/components/presentation/displayOptions";
import { buildSlidesFromSong } from "@/lib/songTypes";
import { cn } from "@/lib/utils";
import { TICKER_MAX_SPEED, TICKER_MIN_SPEED } from "@/lib/ticker";
import { useLiveNavigationStore } from "@/stores/liveNavigationStore";
import { usePresentationStore } from "@/stores/presentationStore";
import { useSongStore } from "@/stores/songStore";
import { useTickerStore } from "@/stores/tickerStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { useScreensStore } from "@/stores/screensStore";

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
  service: "Service",
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
  const compareAbbr = scene.content.comparisonVerse?.translation_abbr;
  const abbrLabel = [abbr, compareAbbr].filter(Boolean).join(" · ");
  return abbrLabel ? `${ref} · ${abbrLabel}` : ref || scene.content.title || "Ready";
}

export function LiveControlsPanel({ displayOptions }: LiveControlsPanelProps) {
  const program = usePresentationStore((s) => s.program);
  const preview = usePresentationStore((s) => s.preview);
  const frozen = usePresentationStore((s) => s.frozen);
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const previewSource = usePresentationStore((s) => s.previewSource);
  const goLive = usePresentationStore((s) => s.goLive);
  const undo = usePresentationStore((s) => s.undo);
  const clear = usePresentationStore((s) => s.clear);
  const blackout = usePresentationStore((s) => s.blackout);
  const showLogo = usePresentationStore((s) => s.showLogo);
  const freeze = usePresentationStore((s) => s.freeze);
  const outputOpen = usePresentationStore((s) => s.outputOpen);
  const outputError = usePresentationStore((s) => s.outputError);
  const displays = usePresentationStore((s) => s.displays);
  const activeDisplay = usePresentationStore((s) => s.activeDisplay);
  const openOutput = usePresentationStore((s) => s.openOutput);
  const closeOutput = usePresentationStore((s) => s.closeOutput);
  const sideScreensShowing = useScreensStore((s) => s.openSide.length);
  const refreshOutput = usePresentationStore((s) => s.refreshOutput);

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
  const goLiveSelectedSuggestion = useTranscriptionStore((s) => s.goLiveSelectedSuggestion);
  const transcriptionSelectedId = useTranscriptionStore((s) => s.selectedSuggestionId);
  const transcriptionSession = useTranscriptionStore((s) => s.verseSession);
  const isTranscriptionContext = previewSource === "transcription";
  const canTakeTranscriptionLive = Boolean(
    transcriptionSession || transcriptionSelectedId || (isTranscriptionContext && preview),
  );
  const isSongLive = previewSource === "song" && songSlides.length > 0;
  const programLabel = formatProgramLabel(program);
  const externalDisplays = displays.filter((display) => !display.is_primary);
  const activeVideoScene =
    (isOnAir && program?.type === "video" && program) ||
    (preview?.type === "video" ? preview : null);
  const showVideoControls = Boolean(activeVideoScene?.content.videoPath);

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

  const tickerSettings = useTickerStore((s) => s.settings);
  const updateTicker = useTickerStore((s) => s.updateSettings);

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
            <SceneRenderer scene={program} compact programSurface displayOptions={displayOptions} label="Logo / standby" />
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

        {showVideoControls && <VideoPlaybackControls className="mt-2" dense />}
        <CountdownPlaybackControls className="mt-2" dense />
      </div>

      <div className="flex flex-col gap-3 p-4">
        <button
          type="button"
          className="go-live-btn"
          onClick={() => {
            if (isTranscriptionContext) {
              void goLiveSelectedSuggestion();
              return;
            }
            void goLive();
          }}
          disabled={isTranscriptionContext ? !canTakeTranscriptionLive : !preview}
        >
          <Zap className="h-4 w-4 fill-current" />
          GO LIVE
          <span className="ml-auto rounded bg-black/25 px-2 py-0.5 text-[10px] font-normal tracking-wide">SPACE</span>
        </button>
        <p className="text-center text-[10px] text-[var(--color-subtle)]">
          {isTranscriptionContext && autoGoLive
            ? "Auto takes confident references — GO LIVE still works for staged verses"
            : preview || canTakeTranscriptionLive
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

      <StageDisplayControls />

      <div className="border-t border-[var(--color-border)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="section-label">Ticker</p>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
            <input
              type="checkbox"
              checked={tickerSettings.enabled}
              onChange={(e) => updateTicker({ enabled: e.target.checked })}
            />
            On air
          </label>
        </div>
        <input
          value={tickerSettings.text}
          onChange={(e) => updateTicker({ text: e.target.value })}
          placeholder="Message to scroll across the output"
          className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wide text-[var(--color-subtle)]">Edge</span>
            <select
              value={tickerSettings.position}
              onChange={(e) => updateTicker({ position: e.target.value === "top" ? "top" : "bottom" })}
              className="h-7 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
            >
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] uppercase tracking-wide text-[var(--color-subtle)]">Speed</span>
            <select
              value={String(tickerSettings.speed)}
              onChange={(e) => updateTicker({ speed: Number(e.target.value) })}
              className="h-7 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
            >
              {Array.from(
                { length: TICKER_MAX_SPEED - TICKER_MIN_SPEED + 1 },
                (_, i) => TICKER_MIN_SPEED + i,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {tickerSettings.enabled && !tickerSettings.text.trim() && (
          <p className="mt-2 text-[10px] text-amber-400">
            Add a message — an empty ticker draws nothing.
          </p>
        )}
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
          {sideScreensShowing > 0 && (
            <p className="mt-0.5 text-[10px] text-[var(--color-subtle)]">
              + {sideScreensShowing === 1 ? "1 copy" : `${sideScreensShowing} copies`} on other screens
            </p>
          )}
          {outputError && (
            <p className="mt-2 text-[10px] leading-snug text-red-400">{outputError}</p>
          )}
          <Link
            to="/settings#screens"
            className="mt-1.5 inline-block text-[10px] text-[var(--color-subtle)] underline-offset-2 hover:text-[var(--color-foreground)] hover:underline"
          >
            Choose screens…
          </Link>
        </div>
      </div>
    </aside>
  );
}
