import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isDesktopApp } from "@/lib/transcription/engineReadiness";
import { captureSource, setCaptureSource, type CaptureSource } from "@/lib/transcription/nativeAudio";
import { type ConfidenceLevel } from "@/lib/transcription/types";
import { useTranscriptionStore } from "@/stores/transcriptionStore";

const selectClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

/** Microphone choice and scripture-detection tuning — set before the service, not during it. */
export function ListenAudioPanel() {
  const status = useTranscriptionStore((s) => s.status);
  const audioDevices = useTranscriptionStore((s) => s.audioDevices);
  const audioDeviceId = useTranscriptionStore((s) => s.audioDeviceId);
  const audioWarning = useTranscriptionStore((s) => s.audioWarning);
  const preflightStatus = useTranscriptionStore((s) => s.preflightStatus);
  const preflightMessage = useTranscriptionStore((s) => s.preflightMessage);
  const paraphraseEnabled = useTranscriptionStore((s) => s.paraphraseEnabled);
  const minConfidence = useTranscriptionStore((s) => s.minConfidence);
  const refreshAudioDevices = useTranscriptionStore((s) => s.refreshAudioDevices);
  const preflightAudio = useTranscriptionStore((s) => s.preflightAudio);
  const setAudioDeviceId = useTranscriptionStore((s) => s.setAudioDeviceId);
  const setParaphraseEnabled = useTranscriptionStore((s) => s.setParaphraseEnabled);
  const setMinConfidence = useTranscriptionStore((s) => s.setMinConfidence);

  const isListening = status === "listening" || status === "processing" || status === "reconnecting";
  const isChecking = preflightStatus === "checking";
  const [source, setSource] = useState<CaptureSource>(captureSource);

  const changeSource = (next: CaptureSource) => {
    setCaptureSource(next);
    setSource(next);
    // The two list devices differently, so the choice of microphone starts over.
    void refreshAudioDevices(true);
  };

  // Settings can be opened before Live Listen ever loaded the device list. Refreshing
  // clears warnings, so leave a running session's alone.
  useEffect(() => {
    if (audioDevices.length === 0 && !isListening) void refreshAudioDevices(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="block">
          <span className={labelClass}>Microphone</span>
          <select
            value={audioDeviceId ?? ""}
            onChange={(e) => setAudioDeviceId(e.target.value || null)}
            disabled={isListening || isChecking}
            className={selectClass}
          >
            {audioDevices.length === 0 && <option value="">No microphone found</option>}
            {audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-[10px] leading-snug text-[var(--color-subtle)]">
          Transcription, the level meter and the mic test all use this input.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isListening || isChecking}
            onClick={() => void preflightAudio({ strict: true })}
            className="control-btn text-[10px]"
          >
            {isChecking ? "Testing mic…" : "Test selected mic"}
          </button>
          <button
            type="button"
            disabled={isListening || isChecking}
            onClick={() => void refreshAudioDevices(true)}
            className="control-btn text-[10px]"
          >
            Refresh mics
          </button>
        </div>
        {isListening && (
          <p className="mt-1 text-[10px] text-[var(--color-subtle)]">Stop listening to change the microphone.</p>
        )}
        {isDesktopApp() && (
          <label className="mt-3 block">
            <span className={labelClass}>Read the microphone through</span>
            <select
              value={source}
              onChange={(e) => changeSource(e.target.value as CaptureSource)}
              disabled={isListening || isChecking}
              className={selectClass}
            >
              <option value="windows">Windows audio (recommended)</option>
              <option value="webview">The app's web view (older)</option>
            </select>
            <span className="mt-1 block text-[10px] leading-snug text-[var(--color-subtle)]">
              Windows audio opens the device directly, with no permission prompt or paused audio engine. If it
              fails, the web view is used automatically.
            </span>
          </label>
        )}
        {preflightMessage && (
          <p
            className={cn(
              "mt-2 text-[10px]",
              preflightStatus === "ready"
                ? "text-emerald-400"
                : preflightStatus === "failed"
                  ? "text-amber-300"
                  : "text-[var(--color-subtle)]",
            )}
          >
            {preflightMessage}
          </p>
        )}
        {audioWarning && <p className="mt-2 text-[10px] text-amber-400">{audioWarning}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Show suggestions with confidence</span>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value as ConfidenceLevel)}
            className={selectClass}
          >
            <option value="low">Low and above</option>
            <option value="medium">Medium and above</option>
            <option value="high">High only</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 self-end pb-2 text-[11px] text-[var(--color-muted-foreground)]">
          <input type="checkbox" checked={paraphraseEnabled} onChange={(e) => setParaphraseEnabled(e.target.checked)} />
          Extra quote matching (find verses read aloud without a reference)
        </label>
      </div>
    </div>
  );
}
