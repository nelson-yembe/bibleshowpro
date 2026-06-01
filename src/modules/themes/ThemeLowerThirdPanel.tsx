import type { ReactNode } from "react";
import { Segmented } from "@/components/ui/pill";
import { STANDARD_LOWER_THIRD_BAR_HEIGHT } from "@/lib/lowerThird";
import type { ThemeConfig } from "@/lib/themeConfig";
import { colorPickerValue } from "@/lib/themeConfig";

function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-[11px] text-[var(--color-subtle)]">{children}</p>;
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1 flex justify-between text-[11px] text-[var(--color-subtle)]">
        <span>{label}</span>
        <span>
          {value}
          {suffix}
        </span>
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        className="w-full accent-[var(--color-primary)]"
      />
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
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={colorPickerValue(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-[var(--color-border-light)]"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-light)]"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-[11px] text-[var(--color-subtle)]">{label}</span>
        {description && <p className="text-[10px] text-[var(--color-subtle)]">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

interface ThemeLowerThirdPanelProps {
  lowerThird: ThemeConfig["lowerThird"];
  onPatch: (patch: Partial<ThemeConfig["lowerThird"]>) => void;
}

export function ThemeLowerThirdPanel({ lowerThird, onPatch }: ThemeLowerThirdPanelProps) {
  const lt = lowerThird;
  const worshipHeight = lt.barHeightPercent > 0;

  return (
    <section className="space-y-3 p-4">
      <p className="section-label">Lower third bar</p>
      <ToggleRow
        label="Enabled"
        description="Default style for scripture, songs, and speaker overlays"
        checked={lt.enabled}
        onChange={(v) => onPatch({ enabled: v })}
      />

      {lt.enabled && (
        <>
          <div>
            <FieldLabel>Default template</FieldLabel>
            <Segmented
              options={[
                { value: "worship", label: "Worship" },
                { value: "classic", label: "Classic" },
                { value: "broadcast", label: "TV" },
                { value: "glass", label: "Glass" },
                { value: "minimal", label: "Min" },
                { value: "line-only", label: "Line" },
              ]}
              value={lt.template}
              onChange={(v) => onPatch({ template: v as typeof lt.template })}
            />
          </div>

          <div>
            <FieldLabel>Default position</FieldLabel>
            <Segmented
              options={[
                { value: "left", label: "Left" },
                { value: "center", label: "Center" },
                { value: "right", label: "Right" },
              ]}
              value={lt.horizontalAlign}
              onChange={(v) => onPatch({ horizontalAlign: v as typeof lt.horizontalAlign })}
            />
          </div>

          <div>
            <FieldLabel>Reference placement</FieldLabel>
            <Segmented
              options={[
                { value: "inline", label: "Inline" },
                { value: "badge", label: "Badge" },
                { value: "above", label: "Above" },
                { value: "below", label: "Below" },
              ]}
              value={lt.referencePlacement}
              onChange={(v) => onPatch({ referencePlacement: v as typeof lt.referencePlacement })}
            />
          </div>

          <div>
            <FieldLabel>Animation</FieldLabel>
            <Segmented
              options={[
                { value: "none", label: "Off" },
                { value: "slide-up", label: "Slide" },
                { value: "fade", label: "Fade" },
              ]}
              value={lt.animation}
              onChange={(v) => onPatch({ animation: v as typeof lt.animation })}
            />
          </div>

          <ColorField label="Bar color" value={lt.barColor} onChange={(v) => onPatch({ barColor: v })} />

          {lt.template === "worship" && (
            <>
              <ColorField
                label="Bar gradient start"
                value={lt.barGradient.from}
                onChange={(v) => onPatch({ barGradient: { ...lt.barGradient, from: v } })}
              />
              <ColorField
                label="Bar gradient end"
                value={lt.barGradient.to}
                onChange={(v) => onPatch({ barGradient: { ...lt.barGradient, to: v } })}
              />
              <ColorField
                label="Gold accent"
                value={lt.accentGoldColor}
                onChange={(v) => onPatch({ accentGoldColor: v })}
              />
            </>
          )}

          <SliderField
            label={worshipHeight ? `Banner height · ${lt.barHeightPercent}%` : `Bar height · ${lt.barHeight}px`}
            value={worshipHeight ? lt.barHeightPercent : lt.barHeight}
            min={worshipHeight ? 18 : 48}
            max={worshipHeight ? 38 : STANDARD_LOWER_THIRD_BAR_HEIGHT}
            suffix={worshipHeight ? "%" : "px"}
            onChange={(v) => {
              if (worshipHeight) onPatch({ barHeightPercent: v });
              else onPatch({ barHeight: v, barHeightPercent: 0 });
            }}
          />

          {lt.template === "worship" && (
            <ToggleRow
              label="Use fixed bar height (px)"
              checked={!worshipHeight}
              onChange={(v) =>
                onPatch(
                  v
                    ? { barHeightPercent: 0, barHeight: lt.barHeight || STANDARD_LOWER_THIRD_BAR_HEIGHT }
                    : { barHeightPercent: lt.barHeightPercent || 28 },
                )
              }
            />
          )}

          <SliderField
            label="Bar text size"
            value={lt.textSize}
            min={14}
            max={48}
            suffix="pt"
            onChange={(v) => onPatch({ textSize: v })}
          />
          <SliderField
            label="Bar width"
            value={lt.widthPercent}
            min={40}
            max={100}
            suffix="%"
            onChange={(v) => onPatch({ widthPercent: v })}
          />
          <SliderField
            label="Content width inside bar"
            value={lt.contentWidthPercent}
            min={50}
            max={100}
            suffix="%"
            onChange={(v) => onPatch({ contentWidthPercent: v })}
          />
          <SliderField
            label="Bottom offset"
            value={lt.bottomOffsetPercent}
            min={0}
            max={20}
            suffix="%"
            onChange={(v) => onPatch({ bottomOffsetPercent: v })}
          />
          <SliderField
            label="Bar opacity"
            value={Math.round(lt.barOpacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => onPatch({ barOpacity: v / 100 })}
          />
          <SliderField
            label="Safe margin"
            value={lt.safeMarginPercent}
            min={0}
            max={12}
            suffix="%"
            onChange={(v) => onPatch({ safeMarginPercent: v })}
          />

          <ToggleRow
            label="Transparent overlay (OBS / NDI)"
            description="Transparent canvas outside the bar"
            checked={lt.transparentOutput}
            onChange={(v) => onPatch({ transparentOutput: v })}
          />
          <ToggleRow
            label="Gold borders"
            checked={lt.showAccent || lt.showBottomAccent}
            onChange={(v) => onPatch({ showAccent: v, showBottomAccent: v })}
          />
          <ToggleRow
            label="Glass blur"
            checked={lt.backdropBlur}
            onChange={(v) => onPatch({ backdropBlur: v })}
          />
          <ToggleRow
            label="Text outline"
            checked={lt.textOutline}
            onChange={(v) => onPatch({ textOutline: v })}
          />
          <ToggleRow
            label="Lower-third text shadow"
            checked={lt.textShadow}
            onChange={(v) => onPatch({ textShadow: v })}
          />
        </>
      )}
    </section>
  );
}
