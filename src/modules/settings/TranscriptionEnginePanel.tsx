import { useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ENGINE_GEMINI, ENGINE_WHISPER } from "@/lib/transcription/engine";
import { engineReadiness, isDesktopApp, type Readiness } from "@/lib/transcription/engineReadiness";
import { DEFAULT_GEMINI_MODEL } from "@/lib/transcription/geminiProtocol";
import { TRANSCRIPTION_MODELS } from "@/lib/transcription/types";
import {
  downloadPercent,
  downloadStatusText,
  formatBytes,
  formatMemory,
  LANGUAGE_OPTIONS,
  languageHint,
  modelsForLanguage,
  recommendedModelId,
  selectedModel,
  type WhisperModelListing,
} from "@/lib/transcription/whisperModels";
import { normalizeLanguage } from "@/lib/transcription/engineConfig";
import { useTranscriptionSetupStore } from "@/stores/transcriptionSetupStore";
import { useTranscriptionStore } from "@/stores/transcriptionStore";
import { cn } from "@/lib/utils";

interface TranscriptionEnginePanelProps {
  embedded?: boolean;
}

const inputClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

export function readinessTone(readiness: Readiness): string {
  switch (readiness.kind) {
    case "ready":
      return "text-emerald-400";
    case "unsupported":
      return "text-red-400";
    default:
      return "text-amber-300";
  }
}

export function TranscriptionEnginePanel({ embedded }: TranscriptionEnginePanelProps) {
  const modelId = useTranscriptionStore((s) => s.modelId);
  const setModelId = useTranscriptionStore((s) => s.setModelId);

  const loaded = useTranscriptionSetupStore((s) => s.loaded);
  const config = useTranscriptionSetupStore((s) => s.config);
  const models = useTranscriptionSetupStore((s) => s.models);
  const capabilities = useTranscriptionSetupStore((s) => s.capabilities);
  const downloadingId = useTranscriptionSetupStore((s) => s.downloadingId);
  const progress = useTranscriptionSetupStore((s) => s.progress);
  const message = useTranscriptionSetupStore((s) => s.message);
  const load = useTranscriptionSetupStore((s) => s.load);
  const saveConfig = useTranscriptionSetupStore((s) => s.saveConfig);
  const setLanguage = useTranscriptionSetupStore((s) => s.setLanguage);
  const useModel = useTranscriptionSetupStore((s) => s.useModel);
  const download = useTranscriptionSetupStore((s) => s.download);
  const cancelDownload = useTranscriptionSetupStore((s) => s.cancelDownload);
  const deleteModel = useTranscriptionSetupStore((s) => s.deleteModel);

  useEffect(() => {
    void load();
  }, [load]);

  const language = config.whisperLanguage;
  const readiness = engineReadiness({
    engineId: modelId,
    desktop: isDesktopApp(),
    config,
    models,
    capabilities,
  });
  const visibleModels = modelsForLanguage(models, language);
  const recommended = recommendedModelId(models, capabilities?.recommendedTier ?? "base", language);
  const inUse = selectedModel(models, config.whisperModelPath);
  const profile = capabilities?.profile;
  const customPath = config.whisperModelPath && !inUse ? config.whisperModelPath : "";

  const browseForModel = async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Whisper model", extensions: ["bin", "gguf"] }],
      });
      if (typeof picked === "string") await saveConfig({ whisperModelPath: picked });
    } catch {
      // Picker unavailable outside the desktop app.
    }
  };

  return (
    <div className={cn("space-y-4", !embedded && "rounded-xl border border-[var(--color-border)] bg-[#0a0c12] p-4")}>
      <fieldset className="space-y-1.5">
        <legend className={labelClass}>Transcription engine</legend>
        {TRANSCRIPTION_MODELS.map((engine) => (
          <label
            key={engine.id}
            className={cn(
              "flex cursor-pointer gap-2 rounded-md border p-2",
              modelId === engine.id
                ? "border-emerald-500/60 bg-emerald-500/5"
                : "border-[var(--color-border-light)]",
            )}
          >
            <input
              type="radio"
              name="transcription-engine"
              value={engine.id}
              checked={modelId === engine.id}
              onChange={() => setModelId(engine.id)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-[var(--color-foreground)]">{engine.label}</span>
              <span className="block text-[10px] leading-snug text-[var(--color-subtle)]">{engine.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <label className={labelClass} htmlFor="spoken-language">
          Language spoken in the service
        </label>
        <select
          id="spoken-language"
          value={language}
          onChange={(e) => void setLanguage(normalizeLanguage(e.target.value))}
          className={inputClass}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] leading-snug text-[var(--color-subtle)]">{languageHint(language, modelId)}</p>
      </div>

      <p role="status" className={cn("text-[11px] font-medium", readinessTone(readiness))}>
        {loaded ? readiness.message : "Checking this PC…"}
      </p>

      {modelId === ENGINE_WHISPER && (
        <div className="space-y-3 rounded-lg border border-[var(--color-border-light)] p-3">
          {profile && (
            <p className="text-[10px] leading-snug text-[var(--color-subtle)]">
              This PC: {profile.cpuName} · {profile.physicalCores} cores · {formatMemory(profile.totalMemoryMb)} memory —{" "}
              {profile.cpu.supported ? (
                <span className="text-emerald-400">offline transcription supported</span>
              ) : (
                <span className="text-red-400">processor lacks {profile.cpu.missing.join(", ")}</span>
              )}
            </p>
          )}

          <div className="space-y-1.5">
            <p className={labelClass}>Speech model</p>
            {visibleModels.length === 0 && (
              <p className="text-[10px] text-[var(--color-subtle)]">Model list unavailable — use the file picker below.</p>
            )}
            {visibleModels.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                recommended={model.id === recommended}
                inUse={inUse?.id === model.id}
                tooBig={Boolean(profile && model.ramMb + 300 > profile.totalMemoryMb)}
                busy={downloadingId === model.id}
                anotherBusy={downloadingId !== null && downloadingId !== model.id}
                progressText={downloadingId === model.id ? downloadStatusText(progress) : null}
                percent={downloadingId === model.id && progress ? downloadPercent(progress.received, progress.total) : 0}
                onUse={() => void useModel(model)}
                onDownload={() => void download(model.id)}
                onCancel={() => void cancelDownload()}
                onDelete={() => void deleteModel(model.id)}
              />
            ))}
          </div>

          <details className="text-[10px] text-[var(--color-subtle)]">
            <summary className="cursor-pointer select-none">Advanced: use a model file you already have</summary>
            <div className="mt-2 flex gap-2">
              <input
                value={customPath}
                readOnly
                placeholder="No custom file selected"
                className={inputClass}
                aria-label="Custom model file"
              />
              <button type="button" onClick={() => void browseForModel()} className="control-btn shrink-0 text-[10px]">
                Browse…
              </button>
            </div>
          </details>
        </div>
      )}

      {modelId === ENGINE_GEMINI && (
        <div className="space-y-2 rounded-lg border border-[var(--color-border-light)] p-3">
          <div>
            <label className={labelClass} htmlFor="gemini-key">
              API key
            </label>
            <input
              id="gemini-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={config.geminiApiKey}
              onChange={(e) => void saveConfig({ geminiApiKey: e.target.value })}
              placeholder="Paste a paid-tier API key"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="gemini-model">
              Model override
            </label>
            <input
              id="gemini-model"
              value={config.geminiModel}
              onChange={(e) => void saveConfig({ geminiModel: e.target.value })}
              placeholder={DEFAULT_GEMINI_MODEL}
              className={inputClass}
            />
          </div>
          <p className="text-[10px] leading-snug text-amber-300/90">
            Use a paid-tier key. On the free tier Google may use the audio to improve its products,
            and human reviewers may read it — wrong for sermon and congregation audio.
          </p>
        </div>
      )}

      {message && <p className="text-[10px] text-[var(--color-subtle)]">{message}</p>}
    </div>
  );
}

interface ModelRowProps {
  model: WhisperModelListing;
  recommended: boolean;
  inUse: boolean;
  tooBig: boolean;
  busy: boolean;
  anotherBusy: boolean;
  progressText: string | null;
  percent: number;
  onUse: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function ModelRow(props: ModelRowProps) {
  const { model, recommended, inUse, tooBig, busy, anotherBusy, progressText, percent } = props;
  const resumable = !model.downloaded && model.partialBytes > 0;
  return (
    <div
      className={cn(
        "rounded-md border p-2",
        inUse ? "border-emerald-500/60 bg-emerald-500/5" : "border-[var(--color-border-light)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-[var(--color-foreground)]">
            {model.label}{" "}
            <span className="text-[var(--color-subtle)]">· {formatBytes(model.sizeBytes)}</span>
            {recommended && (
              <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-px text-[9px] font-semibold uppercase text-emerald-400">
                Recommended for this PC
              </span>
            )}
          </p>
          <p className="truncate text-[10px] text-[var(--color-subtle)]">{model.note}</p>
          {tooBig && <p className="text-[10px] text-amber-300">May be too large for this PC's memory.</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {inUse ? (
            <span className="text-[10px] font-medium text-emerald-400">In use</span>
          ) : busy ? (
            <button type="button" onClick={props.onCancel} className="control-btn text-[10px]">
              Cancel
            </button>
          ) : model.downloaded ? (
            <button type="button" onClick={props.onUse} className="control-btn text-[10px]">
              Use
            </button>
          ) : (
            <button type="button" disabled={anotherBusy} onClick={props.onDownload} className="control-btn text-[10px]">
              {resumable ? "Resume" : "Download"}
            </button>
          )}
          {model.downloaded && !busy && (
            <button
              type="button"
              onClick={props.onDelete}
              className="control-btn text-[10px]"
              aria-label={`Delete ${model.label}`}
              title="Remove from this PC"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {busy && (
        <div className="mt-1.5">
          <div className="h-1 w-full overflow-hidden rounded bg-[var(--color-panel)]">
            <div className="h-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          {progressText && <p className="mt-1 text-[10px] text-[var(--color-subtle)]">{progressText}</p>}
        </div>
      )}
    </div>
  );
}
