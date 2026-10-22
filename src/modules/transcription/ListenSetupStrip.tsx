import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Settings2, Wifi, WifiOff } from "lucide-react";
import { ENGINE_WHISPER } from "@/lib/transcription/engine";
import { normalizeLanguage } from "@/lib/transcription/engineConfig";
import { engineReadiness, isDesktopApp } from "@/lib/transcription/engineReadiness";
import { TRANSCRIPTION_MODELS } from "@/lib/transcription/types";
import {
  downloadPercent,
  downloadStatusText,
  formatBytes,
  LANGUAGE_OPTIONS,
  languageName,
  modelsForLanguage,
  selectedModel,
} from "@/lib/transcription/whisperModels";
import { readinessTone } from "@/modules/settings/TranscriptionEnginePanel";
import { useCaptionStore } from "@/stores/captionStore";
import { useTranscriptionSetupStore } from "@/stores/transcriptionSetupStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { cn } from "@/lib/utils";

const selectClass =
  "h-7 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-0.5 block text-[9px] uppercase tracking-wide text-[var(--color-subtle)]";
const EXPANDED_KEY = "bsp-listen-setup-expanded";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Whisper (offline) — recommended" → "Whisper (offline)" */
function shortEngineName(label: string): string {
  return label.replace(/\s+[—-]\s+.*$/, "");
}

/**
 * Live Listen's setup in one line, so the transcript gets the room. It opens to the
 * switches an operator might need mid-service; everything else lives in Settings.
 * Problems are never folded away: they show whether the strip is open or not.
 */
export function ListenSetupStrip({ disabled }: { disabled: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(readExpanded);

  const modelId = useTranscriptionStore((s) => s.modelId);
  const setModelId = useTranscriptionStore((s) => s.setModelId);
  const heardLanguage = useTranscriptionStore((s) => s.heardLanguage);
  const audioWarning = useTranscriptionStore((s) => s.audioWarning);
  const preflightStatus = useTranscriptionStore((s) => s.preflightStatus);
  const preflightMessage = useTranscriptionStore((s) => s.preflightMessage);
  const captionsOn = useCaptionStore((s) => s.settings.enabled);
  const updateCaptions = useCaptionStore((s) => s.updateSettings);

  const loaded = useTranscriptionSetupStore((s) => s.loaded);
  const config = useTranscriptionSetupStore((s) => s.config);
  const models = useTranscriptionSetupStore((s) => s.models);
  const capabilities = useTranscriptionSetupStore((s) => s.capabilities);
  const downloadingId = useTranscriptionSetupStore((s) => s.downloadingId);
  const progress = useTranscriptionSetupStore((s) => s.progress);
  const message = useTranscriptionSetupStore((s) => s.message);
  const load = useTranscriptionSetupStore((s) => s.load);
  const useModel = useTranscriptionSetupStore((s) => s.useModel);
  const setLanguage = useTranscriptionSetupStore((s) => s.setLanguage);
  const download = useTranscriptionSetupStore((s) => s.download);
  const cancelDownload = useTranscriptionSetupStore((s) => s.cancelDownload);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = () => {
    setExpanded((open) => {
      try {
        localStorage.setItem(EXPANDED_KEY, open ? "0" : "1");
      } catch {
        // Remembering the choice is a convenience.
      }
      return !open;
    });
  };

  const readiness = engineReadiness({ engineId: modelId, desktop: isDesktopApp(), config, models, capabilities });
  const engine = TRANSCRIPTION_MODELS.find((m) => m.id === modelId);
  const isWhisper = modelId === ENGINE_WHISPER;
  const downloaded = modelsForLanguage(models, config.whisperLanguage).filter((m) => m.downloaded);
  const inUse = selectedModel(models, config.whisperModelPath);
  const fixModel =
    readiness.kind === "needs-model" ? (models.find((m) => m.id === readiness.modelId) ?? null) : null;
  const downloadingFix = fixModel !== null && downloadingId === fixModel.id;
  const languageLabel =
    config.whisperLanguage !== "auto"
      ? languageName(config.whisperLanguage)
      : heardLanguage
        ? `English + French · now ${languageName(heardLanguage)}`
        : "English + French";
  const summary = [
    engine ? shortEngineName(engine.label) : modelId,
    languageLabel,
    isWhisper && inUse ? inUse.label : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const ready = loaded && readiness.kind === "ready";
  const micProblem = audioWarning ?? (preflightStatus === "failed" ? preflightMessage : null);

  return (
    <div className="border-t border-[var(--color-border)] px-3 py-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          title={loaded ? readiness.message : "Checking this PC…"}
          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/[0.03]"
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              !loaded ? "bg-[var(--color-subtle)]" : ready ? "bg-emerald-400" : readiness.kind === "unsupported" ? "bg-red-400" : "bg-amber-300",
            )}
          />
          <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">{summary}</span>
          {engine?.requiresInternet ? (
            <Wifi className="h-3 w-3 shrink-0 text-[var(--color-subtle)]" aria-label="Needs internet" />
          ) : (
            <WifiOff className="h-3 w-3 shrink-0 text-[var(--color-subtle)]" aria-label="Works offline" />
          )}
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-[var(--color-subtle)] transition-transform", expanded && "rotate-180")}
          />
        </button>
        <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-muted-foreground)]" title="Live captions on the output screen">
          <input type="checkbox" checked={captionsOn} onChange={(e) => updateCaptions({ enabled: e.target.checked })} />
          Captions
        </label>
        <button
          type="button"
          onClick={() => navigate("/settings#transcription-engines")}
          title="Transcription, microphone and caption settings"
          aria-label="Transcription settings"
          className="shrink-0 rounded p-1 text-[var(--color-subtle)] hover:bg-white/[0.05] hover:text-[var(--color-foreground)]"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {loaded && !ready && (
        <p role="status" className={cn("px-1 pb-1 text-[11px] font-medium leading-snug", readinessTone(readiness))}>
          {readiness.message}
        </p>
      )}

      {fixModel && (
        <div className="px-1 pb-1">
          {downloadingFix ? (
            <>
              <div className="h-1 w-full overflow-hidden rounded bg-[var(--color-panel)]">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-200"
                  style={{ width: `${progress ? downloadPercent(progress.received, progress.total) : 0}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--color-subtle)]">{downloadStatusText(progress)}</span>
                <button type="button" onClick={() => void cancelDownload()} className="control-btn text-[10px]">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled || downloadingId !== null}
              onClick={() => void download(fixModel.id)}
              className="control-btn text-[10px]"
            >
              {fixModel.partialBytes > 0 ? "Resume download" : "Download"} {fixModel.label} ({formatBytes(fixModel.sizeBytes)})
            </button>
          )}
        </div>
      )}

      {loaded && (readiness.kind === "needs-key" || readiness.kind === "unreliable" || readiness.kind === "unsupported") && (
        <button
          type="button"
          onClick={() => navigate("/settings#transcription-engines")}
          className="control-btn mx-1 mb-1 text-[10px]"
        >
          Open transcription settings
        </button>
      )}

      {micProblem && (
        <p className="px-1 pb-1 text-[10px] leading-snug text-amber-400">
          {micProblem}{" "}
          <button
            type="button"
            onClick={() => navigate("/settings#listen-audio")}
            className="underline underline-offset-2 hover:text-amber-200"
          >
            Microphone settings
          </button>
        </p>
      )}

      {expanded && (
        <div className="space-y-2 px-1 pb-1.5 pt-1">
          <div className={cn("grid gap-2", isWhisper && downloaded.length > 0 ? "grid-cols-3" : "grid-cols-2")}>
            <label className="block min-w-0">
              <span className={labelClass}>Engine</span>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={disabled} className={selectClass}>
                {TRANSCRIPTION_MODELS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {shortEngineName(option.label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>Language</span>
              <select
                value={config.whisperLanguage}
                onChange={(e) => void setLanguage(normalizeLanguage(e.target.value))}
                disabled={disabled}
                className={selectClass}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === "auto" ? "English + French" : option.label}
                  </option>
                ))}
              </select>
            </label>
            {isWhisper && downloaded.length > 0 && (
              <label className="block min-w-0">
                <span className={labelClass}>Model</span>
                <select
                  value={inUse?.id ?? ""}
                  onChange={(e) => {
                    const next = downloaded.find((m) => m.id === e.target.value);
                    if (next) void useModel(next);
                  }}
                  disabled={disabled}
                  className={selectClass}
                >
                  {!inUse && <option value="">Choose…</option>}
                  {downloaded.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {formatBytes(m.sizeBytes)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {disabled && (
            <p className="text-[10px] text-[var(--color-subtle)]">Stop listening to change the engine, language or model.</p>
          )}
        </div>
      )}

      {message && !downloadingFix && <p className="px-1 pb-1 text-[10px] text-[var(--color-subtle)]">{message}</p>}
    </div>
  );
}
