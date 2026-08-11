import { useEffect, useMemo, useState } from "react";
import { Image, Music, Save, Video } from "lucide-react";
import type { ServiceItem } from "@/lib/tauri";
import { api } from "@/lib/tauri";
import {
  parseServiceItemContent,
  stringifyServiceItemContent,
  type ServiceItemContent,
} from "@/lib/serviceItemContent";
import {
  COUNTDOWN_DURATION_PRESETS,
  COUNTDOWN_END_BEHAVIOR_OPTIONS,
  COUNTDOWN_SCALE_MAX,
  COUNTDOWN_SCALE_MIN,
  COUNTDOWN_SIZE_PRESETS,
  COUNTDOWN_STYLE_OPTIONS,
  DEFAULT_COUNTDOWN_COLORS,
  combineCountdownParts,
  formatCountdownTime,
  mergeCountdownConfig,
  splitCountdownSeconds,
  type CountdownEndBehavior,
} from "@/lib/countdownConfig";
import { cn } from "@/lib/utils";
import { useServiceStore } from "@/stores/serviceStore";
import { useToastStore } from "@/stores/toastStore";

interface ServiceItemEditorProps {
  item: ServiceItem;
  onPickSong: () => void;
  onPickMedia: (type: "video" | "image") => void;
}

export function ServiceItemEditor({ item, onPickSong, onPickMedia }: ServiceItemEditorProps) {
  const updateItem = useServiceStore((s) => s.updateItem);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.operator_notes ?? "");
  const [content, setContent] = useState<ServiceItemContent>(() => parseServiceItemContent(item.content_json));
  const [saving, setSaving] = useState(false);
  const [linkedSongTitle, setLinkedSongTitle] = useState<string | null>(null);
  const [linkedMediaName, setLinkedMediaName] = useState<string | null>(null);

  useEffect(() => {
    setTitle(item.title);
    setNotes(item.operator_notes ?? "");
    setContent(parseServiceItemContent(item.content_json));
  }, [item.id, item.title, item.operator_notes, item.content_json]);

  useEffect(() => {
    if (item.item_type !== "song" || !content.songId) {
      setLinkedSongTitle(null);
      return;
    }
    void api.getSong(content.songId).then(
      (song) => setLinkedSongTitle(song.title),
      () => setLinkedSongTitle(null),
    );
  }, [item.item_type, content.songId]);

  useEffect(() => {
    const mediaId = content.mediaId;
    if ((item.item_type !== "video" && item.item_type !== "image") || !mediaId) {
      setLinkedMediaName(null);
      return;
    }
    void api.listMedia().then((items) => {
      const match = items.find((entry) => entry.id === mediaId);
      setLinkedMediaName(match?.name ?? null);
    });
  }, [item.item_type, content.mediaId]);

  const dirty = useMemo(() => {
    const savedContent = parseServiceItemContent(item.content_json);
    return (
      title !== item.title ||
      notes !== (item.operator_notes ?? "") ||
      JSON.stringify(content) !== JSON.stringify(savedContent)
    );
  }, [title, notes, content, item.title, item.operator_notes, item.content_json]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextTitle =
        item.item_type === "scripture" && content.reference?.trim()
          ? content.reference.trim()
          : title.trim() || item.title;
      await updateItem(item.id, {
        title: nextTitle,
        contentJson: stringifyServiceItemContent(content),
        operatorNotes: notes,
      });
      setTitle(nextTitle);
      useToastStore.getState().push({ message: "Item settings saved" });
    } finally {
      setSaving(false);
    }
  };

  const countdown = mergeCountdownConfig(content);
  const customParts = splitCountdownSeconds(countdown.countdownSeconds);

  const patchContent = (patch: Partial<ServiceItemContent>) => {
    setContent((prev) => ({ ...prev, ...patch }));
  };

  const setCustomDuration = (hours: number, minutes: number, seconds: number) => {
    const total = combineCountdownParts(hours, minutes, seconds);
    patchContent({
      countdownSeconds: total,
      warningSeconds: Math.min(content.warningSeconds ?? countdown.warningSeconds, total),
      criticalSeconds: Math.min(content.criticalSeconds ?? countdown.criticalSeconds, total),
    });
  };

  return (
    <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
        />
      </Field>

      {item.item_type === "scripture" && (
        <Field label="Reference">
          <input
            value={content.reference ?? ""}
            onChange={(e) => {
              const reference = e.target.value;
              setContent({ ...content, reference });
              setTitle(reference || title);
            }}
            className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            placeholder="Romans 8:28-30"
          />
        </Field>
      )}

      {item.item_type === "song" && (
        <Field label="Linked song">
          <div className="flex gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs">
              <Music className="h-3.5 w-3.5 shrink-0 text-purple-400" />
              <span className="truncate">{linkedSongTitle ?? (content.songId ? "Loading…" : "No song linked")}</span>
            </div>
            <button
              type="button"
              onClick={onPickSong}
              className="shrink-0 rounded-md border border-[var(--color-border-light)] px-2 text-[11px] hover:bg-[var(--color-panel-hover)]"
            >
              {content.songId ? "Change" : "Pick"}
            </button>
          </div>
        </Field>
      )}

      {(item.item_type === "video" || item.item_type === "image") && (
        <Field label={`Linked ${item.item_type}`}>
          <div className="flex gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs">
              {item.item_type === "video" ? (
                <Video className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <Image className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )}
              <span className="truncate">
                {linkedMediaName ?? (content.mediaId ? "Loading…" : `No ${item.item_type} linked`)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onPickMedia(item.item_type as "video" | "image")}
              className="shrink-0 rounded-md border border-[var(--color-border-light)] px-2 text-[11px] hover:bg-[var(--color-panel-hover)]"
            >
              {content.mediaId ? "Change" : "Import / Pick"}
            </button>
          </div>
          {!content.mediaId && (
            <p className="mt-1 text-[10px] text-[var(--color-subtle)]">
              Import from your computer or choose an existing file from the Media library.
            </p>
          )}
        </Field>
      )}

      {item.item_type === "countdown" && (
        <div className="md:col-span-2 space-y-4 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-background)]/40 p-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-label mb-1">Duration</p>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-[var(--color-foreground)]">
                {formatCountdownTime(countdown.countdownSeconds)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTDOWN_DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.seconds}
                  type="button"
                  onClick={() =>
                    patchContent({
                      countdownSeconds: preset.seconds,
                      warningSeconds: Math.min(countdown.warningSeconds, preset.seconds),
                      criticalSeconds: Math.min(countdown.criticalSeconds, preset.seconds),
                    })
                  }
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium",
                    countdown.countdownSeconds === preset.seconds
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-foreground)]"
                      : "border-[var(--color-border-light)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Custom time">
            <div className="flex flex-wrap items-end gap-2">
              <TimePart
                label="Hours"
                value={customParts.hours}
                max={99}
                onChange={(hours) => setCustomDuration(hours, customParts.minutes, customParts.seconds)}
              />
              <span className="pb-2 text-sm text-[var(--color-subtle)]">:</span>
              <TimePart
                label="Minutes"
                value={customParts.minutes}
                max={59}
                onChange={(minutes) => setCustomDuration(customParts.hours, minutes, customParts.seconds)}
              />
              <span className="pb-2 text-sm text-[var(--color-subtle)]">:</span>
              <TimePart
                label="Seconds"
                value={customParts.seconds}
                max={59}
                onChange={(seconds) => setCustomDuration(customParts.hours, customParts.minutes, seconds)}
              />
            </div>
          </Field>

          <Field label="Projection size">
            <div className="space-y-2.5 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)]/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {COUNTDOWN_SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => patchContent({ displayScale: preset.scale })}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-[11px] font-medium",
                      Math.abs(countdown.displayScale - preset.scale) < 0.01
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-foreground)]"
                        : "border-[var(--color-border-light)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                  <span className="sr-only">Size percent</span>
                  <input
                    type="number"
                    min={Math.round(COUNTDOWN_SCALE_MIN * 100)}
                    max={Math.round(COUNTDOWN_SCALE_MAX * 100)}
                    step={5}
                    value={Math.round(countdown.displayScale * 100)}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      if (!Number.isFinite(pct)) return;
                      patchContent({ displayScale: pct / 100 });
                    }}
                    className="h-8 w-16 rounded-md border border-[var(--color-border-light)] bg-[var(--color-background)] px-2 text-right text-xs tabular-nums text-[var(--color-foreground)]"
                  />
                  <span>%</span>
                </label>
              </div>
              <input
                type="range"
                min={Math.round(COUNTDOWN_SCALE_MIN * 100)}
                max={Math.round(COUNTDOWN_SCALE_MAX * 100)}
                step={5}
                value={Math.round(countdown.displayScale * 100)}
                onChange={(e) => patchContent({ displayScale: Number(e.target.value) / 100 })}
                className="w-full accent-[var(--color-primary)]"
                aria-label="Projection size"
              />
              <div className="flex justify-between text-[10px] text-[var(--color-subtle)]">
                <span>Smaller</span>
                <span>Drag to match your screen — preview updates in Stage</span>
                <span>Larger</span>
              </div>
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Warning under (sec)">
              <input
                type="number"
                min={0}
                max={countdown.countdownSeconds}
                value={content.warningSeconds ?? countdown.warningSeconds}
                onChange={(e) => patchContent({ warningSeconds: Math.max(0, Number(e.target.value) || 0) })}
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
              />
            </Field>
            <Field label="Critical under (sec)">
              <input
                type="number"
                min={0}
                max={countdown.countdownSeconds}
                value={content.criticalSeconds ?? countdown.criticalSeconds}
                onChange={(e) => patchContent({ criticalSeconds: Math.max(0, Number(e.target.value) || 0) })}
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
              />
            </Field>
          </div>

          <Field label="Projection style">
            <div className="flex flex-wrap gap-1.5">
              {COUNTDOWN_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patchContent({ style: option.value })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-[11px] font-medium",
                    countdown.style === option.value
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15"
                      : "border-[var(--color-border-light)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="When time runs out">
            <div className="grid gap-1.5">
              {COUNTDOWN_END_BEHAVIOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patchContent({ endBehavior: option.value as CountdownEndBehavior })}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-left",
                    countdown.endBehavior === option.value
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border-light)] hover:bg-[var(--color-panel)]",
                  )}
                >
                  <span>
                    <span className="block text-[11px] font-semibold text-[var(--color-foreground)]">
                      {option.label}
                    </span>
                    <span className="block text-[10px] text-[var(--color-subtle)]">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField
              label="Normal"
              value={content.colors?.normal ?? DEFAULT_COUNTDOWN_COLORS.normal}
              onChange={(value) =>
                patchContent({ colors: { ...countdown.colors, ...content.colors, normal: value } })
              }
            />
            <ColorField
              label="Warning"
              value={content.colors?.warning ?? DEFAULT_COUNTDOWN_COLORS.warning}
              onChange={(value) =>
                patchContent({ colors: { ...countdown.colors, ...content.colors, warning: value } })
              }
            />
            <ColorField
              label="Critical"
              value={content.colors?.critical ?? DEFAULT_COUNTDOWN_COLORS.critical}
              onChange={(value) =>
                patchContent({ colors: { ...countdown.colors, ...content.colors, critical: value } })
              }
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <ToggleRow
              label="Show title"
              checked={countdown.showTitle}
              onChange={(checked) => patchContent({ showTitle: checked })}
            />
            <ToggleRow
              label="Show progress"
              checked={countdown.showProgress}
              onChange={(checked) => patchContent({ showProgress: checked })}
            />
            <ToggleRow
              label="Flash in critical"
              checked={countdown.flashOnCritical}
              onChange={(checked) => patchContent({ flashOnCritical: checked })}
            />
            <ToggleRow
              label="Show clock after 00:00"
              checked={countdown.showClockAfterZero}
              onChange={(checked) => patchContent({ showClockAfterZero: checked })}
            />
          </div>

          <p className="text-[10px] leading-relaxed text-[var(--color-subtle)]">
            Stage shows the full clock. GO LIVE starts the countdown. At zero the timer stays visible with an alert
            and the current wall-clock time (unless you choose logo/next/blackout).
          </p>
        </div>
      )}

      {(item.item_type === "announcement" || item.item_type === "sermon_note" || item.item_type === "logo") && (
        <Field label="Body text">
          <textarea
            value={content.body ?? ""}
            onChange={(e) => setContent({ ...content, body: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
          />
        </Field>
      )}

      {item.item_type === "speaker_lower_third" && (
        <>
          <Field label="Speaker name">
            <input
              value={content.speakerName ?? ""}
              onChange={(e) => setContent({ ...content, speakerName: e.target.value })}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            />
          </Field>
          <Field label="Speaker title">
            <input
              value={content.speakerTitle ?? ""}
              onChange={(e) => setContent({ ...content, speakerTitle: e.target.value })}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            />
          </Field>
        </>
      )}

      <Field label="Operator note">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
          placeholder="Notes visible to operator only..."
        />
      </Field>
    </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <p className="text-[10px] text-[var(--color-subtle)]">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function TimePart({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-[var(--color-subtle)]">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="h-9 w-16 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-center text-sm tabular-nums"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-[var(--color-border-light)] bg-[var(--color-panel)] p-0.5"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
        />
      </div>
    </Field>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-light)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}
