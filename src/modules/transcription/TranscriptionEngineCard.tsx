import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ENGINE_WHISPER } from "@/lib/transcription/engine";
import { engineReadiness, isDesktopApp } from "@/lib/transcription/engineReadiness";
import { TRANSCRIPTION_MODELS } from "@/lib/transcription/types";
import { normalizeLanguage } from "@/lib/transcription/engineConfig";
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
import { useTranscriptionSetupStore } from "@/stores/transcriptionSetupStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

/**
 * Engine choice on the page operators actually work from, with a one-line verdict and the
 * one action that fixes it — so problems surface before Start, not during the sermon.
 */
export function TranscriptionEngineCard({ disabled }: { disabled: boolean }) {
  const navigate = useNavigate();
  const modelId = useTranscriptionStore((s) => s.modelId);
  const setModelId = useTranscriptionStore((s) => s.setModelId);
  const heardLanguage = useTranscriptionStore((s) => s.heardLanguage);

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

  const readiness = engineReadiness({
    engineId: modelId,
    desktop: isDesktopApp(),
    config,
    models,
    capabilities,
  });
  const downloaded = modelsForLanguage(models, config.whisperLanguage).filter((m) => m.downloaded);
  const inUse = selectedModel(models, config.whisperModelPath);
  const fixModel =
    readiness.kind === "needs-model" ? models.find((m) => m.id === readiness.modelId) ?? null : null;
  const downloadingThis = fixModel !== null && downloadingId === fixModel.id;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[#0a0c12] p-3">
      <h2 className="section-label mb-2">Transcription engine</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Engine</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={disabled}
            className={selectClass}
          >
            {TRANSCRIPTION_MODELS.map((engine) => (
              <option key={engine.id} value={engine.id}>
                {engine.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
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
        {modelId === ENGINE_WHISPER && downloaded.length > 0 && (
          <label className="col-span-2 block">
            <span className={labelClass}>Speech model</span>
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

      <p role="status" className={cn("mt-2 text-[11px] font-medium leading-snug", readinessTone(readiness))}>
        {loaded ? readiness.message : "Checking this PC…"}
      </p>
      {config.whisperLanguage === "auto" && heardLanguage && (
        <p className="mt-1 text-[10px] text-[var(--color-subtle)]">
          Last sentence heard in: <span className="text-[var(--color-foreground)]">{languageName(heardLanguage)}</span>
        </p>
      )}

      {fixModel && (
        <div className="mt-2">
          {downloadingThis ? (
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

      {(readiness.kind === "needs-key" || readiness.kind === "unreliable" || readiness.kind === "unsupported") && (
        <button type="button" onClick={() => navigate("/settings")} className="control-btn mt-2 text-[10px]">
          Open transcription settings
        </button>
      )}

      {message && !downloadingThis && <p className="mt-1.5 text-[10px] text-[var(--color-subtle)]">{message}</p>}
    </section>
  );
}
