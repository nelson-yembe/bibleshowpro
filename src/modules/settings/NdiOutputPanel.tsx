import { memo, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Antenna,
  MonitorPlay,
  Radio,
  RefreshCw,
  ScanSearch,
  Settings2,
  Signal,
  Wifi,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/pill";
import {
  defaultNdiConfig,
  formatBitrate,
  formatNdiFps,
  NDI_FPS_PRESETS,
  NDI_RESOLUTION_PRESETS,
  type NdiOutputConfig,
} from "@/lib/ndiConfig";
import { useNdiStore } from "@/stores/ndiStore";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-[var(--color-border-light)]/60 px-3 py-2.5">
      <span>
        <span className="block text-xs font-medium text-[var(--color-foreground)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10px] leading-relaxed text-[var(--color-subtle)]">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
      />
    </label>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-light)]/60 bg-[#0a0c12] px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-[var(--color-subtle)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--color-foreground)]">{value}</p>
      {sub ? <p className="text-[10px] text-[var(--color-subtle)]">{sub}</p> : null}
    </div>
  );
}

/**
 * Live stats fed by the 1.5s NDI status poll. Isolated + memoized so the poll
 * only re-renders these read-only cards, not the surrounding config controls
 * and dropdowns (which would otherwise flicker while NDI is running).
 */
const NdiLiveStats = memo(function NdiLiveStats() {
  const status = useNdiStore((s) => s.status);

  const uptimeLabel = useMemo(() => {
    if (!status?.uptimeMs) return "—";
    const sec = Math.floor(status.uptimeMs / 1000);
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return min > 0 ? `${min}m ${rem}s` : `${sec}s`;
  }, [status?.uptimeMs]);

  if (!status) return null;

  return (
    <>
      {status.error ? (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {status.error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Program connections"
          value={String(status.program.connections)}
          sub={status.program.sourceName || "—"}
        />
        <StatCard
          label="Program FPS"
          value={status.program.measuredFps.toFixed(1)}
          sub={`${status.program.width}×${status.program.height}`}
        />
        <StatCard
          label="Bitrate"
          value={formatBitrate(status.program.bitrate)}
          sub={`${status.program.videoFrames.toLocaleString()} video frames`}
        />
        <StatCard label="Uptime" value={uptimeLabel} sub={status.captureMode.replace("_", " ")} />
      </div>

      {status.program.tallyProgram || status.program.tallyPreview ? (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {status.program.tallyProgram ? (
            <span className="rounded bg-red-900/50 px-2 py-1 font-semibold text-red-200">TALLY PROGRAM</span>
          ) : null}
          {status.program.tallyPreview ? (
            <span className="rounded bg-emerald-900/50 px-2 py-1 font-semibold text-emerald-200">
              TALLY PREVIEW
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
});

export function NdiOutputPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const config = useNdiStore((s) => s.config);
  const discovered = useNdiStore((s) => s.discovered);
  const loading = useNdiStore((s) => s.loading);
  const saving = useNdiStore((s) => s.saving);
  const discovering = useNdiStore((s) => s.discovering);
  const error = useNdiStore((s) => s.error);
  // Primitive selector — re-renders only when running toggles, not every poll.
  const running = useNdiStore((s) => s.status?.running ?? false);
  const loadConfig = useNdiStore((s) => s.loadConfig);
  const stopPolling = useNdiStore((s) => s.stopPolling);
  const saveConfig = useNdiStore((s) => s.saveConfig);
  const start = useNdiStore((s) => s.start);
  const stop = useNdiStore((s) => s.stop);
  const refreshStatus = useNdiStore((s) => s.refreshStatus);
  const discoverSources = useNdiStore((s) => s.discoverSources);

  const [resolutionPreset, setResolutionPreset] = useState("1080p");
  const [fpsPreset, setFpsPreset] = useState("30");
  const [groupsText, setGroupsText] = useState(config.groups.join(", "));

  useEffect(() => {
    void loadConfig();
    return () => stopPolling();
  }, [loadConfig, stopPolling]);

  useEffect(() => {
    setGroupsText(config.groups.join(", "));
  }, [config.groups]);

  const applyResolutionPreset = (presetId: string) => {
    setResolutionPreset(presetId);
    const preset = NDI_RESOLUTION_PRESETS.find((p) => p.id === presetId);
    if (!preset || preset.id === "custom") return;
    void saveConfig({ width: preset.width, height: preset.height });
  };

  const applyFpsPreset = (presetId: string) => {
    setFpsPreset(presetId);
    const preset = NDI_FPS_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    void saveConfig({ fps: preset.fps, fpsDenominator: preset.fpsDenominator });
  };

  const saveGroups = () => {
    const groups = groupsText
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    void saveConfig({ groups: groups.length > 0 ? groups : defaultNdiConfig().groups });
  };

  const patch = (partial: Partial<NdiOutputConfig>) => {
    void saveConfig(partial);
  };

  return (
    <div className={embedded ? "space-y-5" : "panel space-y-5 p-5"}>
      {embedded ? (
        <p className="max-w-2xl text-xs leading-relaxed text-[var(--color-subtle)]">
          Broadcast program and preview feeds over NDI for OBS, vMix, ProPresenter, and hardware
          switchers. Uses mDNS discovery, tally, metadata, and configurable frame rates.
        </p>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Antenna className="h-4 w-4 text-[var(--color-primary)]" />
              NDI Output
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--color-subtle)]">
              Broadcast program and preview feeds over NDI for OBS, vMix, ProPresenter, and hardware
              switchers. Uses mDNS discovery, tally, metadata, and configurable frame rates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <StatusBadge variant="live">● NDI LIVE</StatusBadge>
            ) : (
              <StatusBadge variant="draft">NDI Off</StatusBadge>
            )}
            {saving ? <StatusBadge variant="draft">Saving…</StatusBadge> : null}
          </div>
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!running ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={loading}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Start NDI Output
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stop()}
            className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-2 text-xs font-semibold text-red-200"
          >
            Stop NDI Output
          </button>
        )}
        <button
          type="button"
          onClick={() => void refreshStatus()}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-light)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh stats
        </button>
        <button
          type="button"
          onClick={() => void discoverSources()}
          disabled={discovering}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-light)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
        >
          <ScanSearch className="h-3.5 w-3.5" />
          {discovering ? "Scanning…" : "Discover network sources"}
        </button>
      </div>

      <NdiLiveStats />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <p className="section-label flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            Source names
          </p>
          <Field
            label="Program source name"
            value={config.programSourceName}
            onChange={(v) => patch({ programSourceName: v })}
          />
          <ToggleRow
            label="Enable preview NDI source"
            description="Separate NDI output for staged preview (director monitor)."
            checked={config.enablePreviewOutput}
            onChange={(v) => patch({ enablePreviewOutput: v })}
          />
          {config.enablePreviewOutput ? (
            <Field
              label="Preview source name"
              value={config.previewSourceName}
              onChange={(v) => patch({ previewSourceName: v })}
            />
          ) : null}
        </section>

        <section className="space-y-3">
          <p className="section-label flex items-center gap-1.5">
            <MonitorPlay className="h-3.5 w-3.5" />
            Video format
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-[var(--color-subtle)]">Resolution</span>
              <select
                value={resolutionPreset}
                onChange={(e) => applyResolutionPreset(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
              >
                {NDI_RESOLUTION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-[var(--color-subtle)]">Frame rate</span>
              <select
                value={fpsPreset}
                onChange={(e) => applyFpsPreset(e.target.value)}
                className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
              >
                {NDI_FPS_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {resolutionPreset === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Width"
                value={String(config.width)}
                onChange={(v) => patch({ width: Number(v) || 1920 })}
              />
              <Field
                label="Height"
                value={String(config.height)}
                onChange={(v) => patch({ height: Number(v) || 1080 })}
              />
            </div>
          ) : (
            <p className="text-[10px] text-[var(--color-subtle)]">
              Output: {config.width} × {config.height} @ {formatNdiFps(config)}
            </p>
          )}
          <label className="block">
            <span className="text-[10px] text-[var(--color-subtle)]">Pixel format</span>
            <select
              value={config.pixelFormat}
              onChange={(e) => patch({ pixelFormat: e.target.value as NdiOutputConfig["pixelFormat"] })}
              className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            >
              <option value="bgra">BGRA 8-bit (recommended)</option>
              <option value="uyvy">UYVY 4:2:2</option>
            </select>
          </label>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <p className="section-label flex items-center gap-1.5">
            <Wifi className="h-3.5 w-3.5" />
            Network & groups
          </p>
          <Field
            label="NDI groups (comma-separated)"
            value={groupsText}
            onChange={setGroupsText}
            onBlur={saveGroups}
          />
          <div className="grid grid-cols-2 gap-2">
          <Field
            label="Port (0 = auto)"
            value={String(config.port)}
            onChange={(v) => patch({ port: Number(v) || 0 })}
          />
          <Field
            label="Max connections"
            value={String(config.maxConnections)}
            onChange={(v) => patch({ maxConnections: Number(v) || 64 })}
          />
          </div>
        </section>

        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Advanced features
          </p>
          <ToggleRow
            label="Include audio track"
            description="Sends a silent 48 kHz stereo audio stream (for receivers that require audio)."
            checked={config.enableAudio}
            onChange={(v) => patch({ enableAudio: v })}
          />
          <ToggleRow
            label="Metadata stream"
            description="Product and frame metadata for advanced NDI workflows."
            checked={config.enableMetadata}
            onChange={(v) => patch({ enableMetadata: v })}
          />
          <ToggleRow
            label="Tally support"
            description="Reflect program/preview tally from connected receivers."
            checked={config.enableTally}
            onChange={(v) => patch({ enableTally: v })}
          />
          <ToggleRow
            label="PTZ passthrough"
            description="Accept PTZ commands from NDI receivers."
            checked={config.enablePtz}
            onChange={(v) => patch({ enablePtz: v })}
          />
          <ToggleRow
            label="Bandwidth adaptation"
            checked={config.enableBandwidthAdaptation}
            onChange={(v) => patch({ enableBandwidthAdaptation: v })}
          />
        </section>
      </div>

      <section className="space-y-3">
        <p className="section-label flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" />
          Capture & automation
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] text-[var(--color-subtle)]">Capture mode</span>
            <select
              value={config.captureMode}
              onChange={(e) =>
                patch({ captureMode: e.target.value as NdiOutputConfig["captureMode"] })
              }
              className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            >
              <option value="output_window">Output window (recommended)</option>
              <option value="ipc_frames">App frame push (experimental)</option>
            </select>
          </label>
          <Field
            label="Metadata interval (ms)"
            value={String(config.metadataIntervalMs)}
            onChange={(v) => patch({ metadataIntervalMs: Number(v) || 1000 })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label="Auto-start on Go Live"
            description="Start NDI when you take program live."
            checked={config.autoStartOnGoLive}
            onChange={(v) => patch({ autoStartOnGoLive: v })}
          />
          <ToggleRow
            label="Auto-start on launch"
            checked={config.autoStartOnLaunch}
            onChange={(v) => patch({ autoStartOnLaunch: v })}
          />
          <ToggleRow
            label="Open projector when starting NDI"
            checked={config.autoOpenOutputWhenStarting}
            onChange={(v) => patch({ autoOpenOutputWhenStarting: v })}
          />
          <ToggleRow
            label="Test pattern when capture unavailable"
            description="Send a color bar pattern if the output window cannot be captured."
            checked={config.showTestPatternWhenIdle}
            onChange={(v) => patch({ showTestPatternWhenIdle: v })}
          />
        </div>
      </section>

      {discovered.length > 0 ? (
        <section className="space-y-2">
          <p className="section-label flex items-center gap-1.5">
            <Signal className="h-3.5 w-3.5" />
            Discovered on network ({discovered.length})
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border-light)]">
            {discovered.map((source) => (
              <div
                key={source.id}
                className="border-b border-[var(--color-border-light)]/60 px-3 py-2 last:border-0"
              >
                <p className="text-xs font-medium">{source.name}</p>
                <p className="text-[10px] text-[var(--color-subtle)]">
                  {source.address}
                  {source.groups.length > 0 ? ` · ${source.groups.join(", ")}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[10px] leading-relaxed text-[var(--color-subtle)]">
        NDI® is a registered trademark of Vizrt. Ensure receivers on your LAN can discover mDNS/Bonjour
        services. For best results, open the projector output before starting NDI, or enable auto-open above.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-[var(--color-subtle)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="mt-1 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
      />
    </label>
  );
}
