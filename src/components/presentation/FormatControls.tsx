import { Plus } from "lucide-react";
import { Segmented } from "@/components/ui/pill";
import {
  backgroundPresets,
  type DisplayOptions,
} from "@/components/presentation/displayOptions";
import { HIGHLIGHT_COLOR_PRESETS } from "@/components/presentation/highlightStyle";
import { cn } from "@/lib/utils";

interface FormatControlsProps {
  options: DisplayOptions;
  onChange: (patch: Partial<DisplayOptions>) => void;
  onExpandRange?: () => void;
  /** Fields controlled by the Themes screen — shown read-only on Bible Search */
  themeControlledFields?: (keyof DisplayOptions)[];
}

const DEFAULT_THEME_FIELDS: (keyof DisplayOptions)[] = [
  "fontSize",
  "textAlign",
  "showVerseNumbers",
  "showReference",
  "showVersion",
  "autoFit",
];

export function FormatControls({
  options,
  onChange,
  onExpandRange,
  themeControlledFields = [],
}: FormatControlsProps) {
  const themeFields = new Set(themeControlledFields);
  const locked = (key: keyof DisplayOptions) => themeFields.has(key);
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <Field label="Verse range">
        <div className="flex items-center gap-1.5">
          <input
            value={options.verseStart}
            onChange={(e) => onChange({ verseStart: e.target.value })}
            className="h-8 w-10 rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-1 text-center text-xs"
          />
          <span className="text-[var(--color-subtle)]">–</span>
          <input
            value={options.verseEnd}
            onChange={(e) => onChange({ verseEnd: e.target.value })}
            className="h-8 w-10 rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-1 text-center text-xs"
          />
          <button
            type="button"
            onClick={onExpandRange}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
            title="Expand verse range"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </Field>

      <Field label="Show">
        <div className="flex gap-1">
          <ToggleChip
            active={options.showVerseNumbers}
            disabled={locked("showVerseNumbers")}
            onClick={() => onChange({ showVerseNumbers: !options.showVerseNumbers })}
          >
            /v
          </ToggleChip>
          <ToggleChip
            active={options.showReference}
            disabled={locked("showReference")}
            onClick={() => onChange({ showReference: !options.showReference })}
          >
            ref
          </ToggleChip>
          <ToggleChip
            active={options.showVersion}
            disabled={locked("showVersion")}
            onClick={() => onChange({ showVersion: !options.showVersion })}
          >
            ver
          </ToggleChip>
        </div>
      </Field>

      <Field label="Alignment">
        {locked("textAlign") ? (
          <p className="flex h-8 items-center text-xs text-[var(--color-subtle)] capitalize">{options.textAlign}</p>
        ) : (
          <Segmented
            options={[
              { value: "left", label: "L" },
              { value: "center", label: "C" },
              { value: "right", label: "R" },
            ]}
            value={options.textAlign}
            onChange={(v) => onChange({ textAlign: v as DisplayOptions["textAlign"] })}
          />
        )}
      </Field>

      <Field label="Background">
        <select
          value={options.backgroundPreset}
          onChange={(e) => onChange({ backgroundPreset: e.target.value as DisplayOptions["backgroundPreset"] })}
          className="h-8 min-w-[130px] rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-2 text-xs"
        >
          <option value="theme">Active theme</option>
          {Object.entries(backgroundPresets).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={locked("fontSize") ? `Font size · ${options.fontSize}pt (theme)` : `Font size · ${options.fontSize}pt`}
        className="min-w-[150px]"
      >
        {locked("fontSize") ? (
          <p className="text-[10px] leading-relaxed text-[var(--color-subtle)]">
            Edit body size in Themes → Typography
          </p>
        ) : (
          <input
            type="range"
            min={32}
            max={96}
            value={options.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        )}
      </Field>

      <Field label="Highlight phrase" className="min-w-[220px] flex-1">
        <div className="flex items-center gap-2">
          <input
            value={options.highlightPhrase}
            onChange={(e) => onChange({ highlightPhrase: e.target.value })}
            placeholder="Select text in preview or type a phrase"
            className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-2.5 text-xs"
          />
          <input
            type="color"
            value={options.highlightColor}
            onChange={(e) => onChange({ highlightColor: e.target.value })}
            title="Highlight color"
            className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] p-0.5"
          />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {HIGHLIGHT_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              title={preset.label}
              onClick={() => onChange({ highlightColor: preset.value })}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                options.highlightColor.toLowerCase() === preset.value.toLowerCase()
                  ? "border-white"
                  : "border-transparent",
              )}
              style={{ backgroundColor: preset.value }}
            />
          ))}
        </div>
      </Field>

      <Field label="Emphasize verse">
        <Segmented
          options={[
            { value: "none", label: "None" },
            { value: "bold", label: "Bold" },
            { value: "glow", label: "Glow" },
          ]}
          value={options.emphasis}
          onChange={(v) => onChange({ emphasis: v as DisplayOptions["emphasis"] })}
        />
      </Field>

      <Field label="Auto-fit text">
        {locked("autoFit") ? (
          <p className="text-[10px] leading-relaxed text-[var(--color-subtle)]">
            Always on — fills {options.fontSize}pt max to screen or lower third
          </p>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ autoFit: !options.autoFit })}
            className={cn(
              "relative h-5 w-10 rounded-full transition-colors",
              options.autoFit ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-light)]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                options.autoFit ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        )}
      </Field>
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

function ToggleChip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 min-w-[36px] items-center justify-center rounded-md border px-2 text-[11px] font-semibold",
        disabled && "cursor-not-allowed opacity-50",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-border-light)] bg-[var(--color-panel)] text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
      )}
    >
      {children}
    </button>
  );
}

export { DEFAULT_THEME_FIELDS };
