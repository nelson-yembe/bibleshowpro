import { Segmented } from "@/components/ui/pill";
import {
  LOWER_THIRD_PRESETS,
  type LowerThirdOverrides,
} from "@/lib/lowerThird";
import type { LowerThirdStyle } from "@/lib/themeConfig";
import { cn } from "@/lib/utils";
import { Monitor, Radio, Sparkles } from "lucide-react";

export interface LowerThirdControlState {
  lowerThird?: LowerThirdOverrides;
  showLowerThirdSafeMargins?: boolean;
  lowerThirdChromaPreview?: boolean;
}

interface LowerThirdControlsProps {
  effective: LowerThirdStyle;
  state: LowerThirdControlState;
  onChange: (patch: Partial<LowerThirdControlState & LowerThirdOverrides>) => void;
  onShowToggle?: (patch: { showReference?: boolean; showVersion?: boolean; showVerseNumbers?: boolean }) => void;
  showReference?: boolean;
  showVersion?: boolean;
  showVerseNumbers?: boolean;
}

export function LowerThirdControls({
  effective,
  state,
  onChange,
  onShowToggle,
  showReference = true,
  showVersion = true,
  showVerseNumbers = true,
}: LowerThirdControlsProps) {
  const patchLt = (overrides: LowerThirdOverrides) => {
    onChange({
      lowerThird: { ...(state.lowerThird ?? {}), ...overrides },
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = LOWER_THIRD_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      lowerThird: { ...(state.lowerThird ?? {}), ...preset.overrides },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-primary)]" />
            Lower third
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-subtle)]">
            Stream-ready overlays with broadcast safe zones, chroma output, and animation.
          </p>
        </div>
        <select
          onChange={(e) => {
            if (e.target.value) applyPreset(e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
          className="h-8 shrink-0 rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-2 text-[11px]"
        >
          <option value="" disabled>
            Apply preset…
          </option>
          {LOWER_THIRD_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LOWER_THIRD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.description}
            onClick={() => applyPreset(p.id)}
            className="rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-foreground)]"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Template">
          <Segmented
            options={[
              { value: "worship", label: "Worship" },
              { value: "classic", label: "Classic" },
              { value: "broadcast", label: "TV" },
              { value: "glass", label: "Glass" },
              { value: "minimal", label: "Min" },
              { value: "line-only", label: "Line" },
            ]}
            value={effective.template}
            onChange={(v) => patchLt({ template: v as LowerThirdStyle["template"] })}
          />
        </Field>

        <Field label="Position">
          <Segmented
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            value={effective.horizontalAlign}
            onChange={(v) => patchLt({ horizontalAlign: v as LowerThirdStyle["horizontalAlign"] })}
          />
        </Field>

        <Field label="Reference">
          <Segmented
            options={[
              { value: "inline", label: "Inline" },
              { value: "badge", label: "Badge" },
              { value: "above", label: "Above" },
              { value: "below", label: "Below" },
            ]}
            value={effective.referencePlacement}
            onChange={(v) => patchLt({ referencePlacement: v as LowerThirdStyle["referencePlacement"] })}
          />
        </Field>

        <Field label={`Bar width · ${effective.widthPercent}%`}>
          <input
            type="range"
            min={40}
            max={100}
            value={effective.widthPercent}
            onChange={(e) => patchLt({ widthPercent: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>

        <Field label={`Bottom offset · ${effective.bottomOffsetPercent}%`}>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={effective.bottomOffsetPercent}
            onChange={(e) => patchLt({ bottomOffsetPercent: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>

        <Field label={`Bar height · ${effective.barHeight}px`}>
          <input
            type="range"
            min={18}
            max={72}
            value={effective.barHeight}
            onChange={(e) => patchLt({ barHeight: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>

        <Field label={`Opacity · ${Math.round(effective.barOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(effective.barOpacity * 100)}
            onChange={(e) => patchLt({ barOpacity: Number(e.target.value) / 100 })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>

        <Field label={`Text size · ${effective.textSize}pt`}>
          <input
            type="range"
            min={14}
            max={40}
            value={effective.textSize}
            onChange={(e) => patchLt({ textSize: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>

        <Field label="Animation">
          <Segmented
            options={[
              { value: "none", label: "Off" },
              { value: "slide-up", label: "Slide" },
              { value: "fade", label: "Fade" },
            ]}
            value={effective.animation}
            onChange={(v) => patchLt({ animation: v as LowerThirdStyle["animation"] })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--color-border-light)] pt-4">
        <ToggleRow
          label="Gold borders"
          checked={effective.showAccent || effective.showBottomAccent}
          onChange={(v) => patchLt({ showAccent: v, showBottomAccent: v })}
        />
        {effective.template === "worship" && (
          <Field label={`Banner height · ${effective.barHeightPercent || 28}%`} className="min-w-[180px]">
            <input
              type="range"
              min={18}
              max={38}
              value={effective.barHeightPercent || 28}
              onChange={(e) => patchLt({ barHeightPercent: Number(e.target.value) })}
              className="w-full accent-[var(--color-primary)]"
            />
          </Field>
        )}
        {effective.showAccent && effective.template !== "worship" && (
          <Field label="Accent side" className="min-w-[140px]">
            <Segmented
              options={[
                { value: "top", label: "Top" },
                { value: "left", label: "Left" },
                { value: "bottom", label: "Bottom" },
              ]}
              value={effective.accentPosition}
              onChange={(v) => patchLt({ accentPosition: v as LowerThirdStyle["accentPosition"] })}
            />
          </Field>
        )}
        <ToggleRow
          label="Glass blur"
          checked={effective.backdropBlur}
          onChange={(v) => patchLt({ backdropBlur: v })}
        />
        <ToggleRow
          label="Text outline"
          checked={effective.textOutline}
          onChange={(v) => patchLt({ textOutline: v })}
        />
        <ToggleRow
          label="Chroma / transparent output"
          checked={effective.transparentOutput}
          onChange={(v) => patchLt({ transparentOutput: v })}
          icon={<Radio className="h-3 w-3" />}
        />
        <ToggleRow
          label="Show safe margins"
          checked={!!state.showLowerThirdSafeMargins}
          onChange={(v) => onChange({ showLowerThirdSafeMargins: v })}
          icon={<Monitor className="h-3 w-3" />}
        />
        {effective.transparentOutput && (
          <ToggleRow
            label="Chroma preview grid"
            checked={state.lowerThirdChromaPreview !== false}
            onChange={(v) => onChange({ lowerThirdChromaPreview: v })}
          />
        )}
      </div>

      {onShowToggle && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border-light)] pt-4">
          <p className="section-label w-full">On-screen elements</p>
          <ToggleChip active={showVerseNumbers} onClick={() => onShowToggle({ showVerseNumbers: !showVerseNumbers })}>
            /v
          </ToggleChip>
          <ToggleChip active={showReference} onClick={() => onShowToggle({ showReference: !showReference })}>
            ref
          </ToggleChip>
          <ToggleChip active={showVersion} onClick={() => onShowToggle({ showVersion: !showVersion })}>
            ver
          </ToggleChip>
          {effective.referencePlacement === "badge" && (
            <span className="text-[10px] text-[var(--color-subtle)]">Reference renders as a badge in TV template</span>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="section-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
      {icon}
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative ml-1 h-5 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-light)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </label>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-[36px] items-center justify-center rounded-md border px-2 text-[11px] font-semibold",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-border-light)] bg-[var(--color-panel)] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
      )}
    >
      {children}
    </button>
  );
}
