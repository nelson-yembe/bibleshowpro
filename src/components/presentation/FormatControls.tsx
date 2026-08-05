import { Link } from "react-router-dom";
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
  const themeLocked = themeFields.size > 0;

  const showBits = [
    options.showVerseNumbers ? "verse #s" : null,
    options.showReference ? "ref" : null,
    options.showVersion ? "version" : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
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

        <Field label="Highlight phrase" className="min-w-[240px] flex-[1.4]">
          <div className="flex items-center gap-2">
            <input
              value={options.highlightPhrase}
              onChange={(e) => onChange({ highlightPhrase: e.target.value })}
              placeholder="Select text in preview or type a phrase"
              className="h-8 min-w-0 flex-1 rounded-md border border-[var(--color-border-light)] bg-[#0a0c12] px-2.5 text-xs"
            />
            {options.highlightPhrase ? (
              <button
                type="button"
                onClick={() => onChange({ highlightPhrase: "" })}
                className="h-8 shrink-0 rounded-md border border-[var(--color-border-light)] px-2 text-[10px] font-medium text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
              >
                Clear
              </button>
            ) : null}
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

        <Field label="Emphasize">
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

        <Field label="Background">
          <select
            value={options.backgroundPreset}
            onChange={(e) =>
              onChange({ backgroundPreset: e.target.value as DisplayOptions["backgroundPreset"] })
            }
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
      </div>

      {themeLocked ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)]/60 pt-2.5 text-[10px] text-[var(--color-subtle)]">
          <span className="rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1">
            Theme · {options.fontSize}pt · {options.textAlign}
            {showBits.length ? ` · ${showBits.join(" · ")}` : ""}
            {options.autoFit ? " · auto-fit" : ""}
          </span>
          <Link
            to="/themes"
            className="font-medium text-[var(--color-muted-foreground)] underline-offset-2 hover:text-[var(--color-foreground)] hover:underline"
          >
            Edit in Themes
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-[var(--color-border)]/60 pt-2.5">
          <Field label="Show">
            <div className="flex gap-1">
              <ToggleChip
                active={options.showVerseNumbers}
                onClick={() => onChange({ showVerseNumbers: !options.showVerseNumbers })}
              >
                Verse #
              </ToggleChip>
              <ToggleChip
                active={options.showReference}
                onClick={() => onChange({ showReference: !options.showReference })}
              >
                Reference
              </ToggleChip>
              <ToggleChip
                active={options.showVersion}
                onClick={() => onChange({ showVersion: !options.showVersion })}
              >
                Version
              </ToggleChip>
            </div>
          </Field>

          <Field label="Alignment">
            <Segmented
              options={[
                { value: "left", label: "L" },
                { value: "center", label: "C" },
                { value: "right", label: "R" },
              ]}
              value={options.textAlign}
              onChange={(v) => onChange({ textAlign: v as DisplayOptions["textAlign"] })}
            />
          </Field>

          <Field label={`Font size · ${options.fontSize}pt`} className="min-w-[150px]">
            <input
              type="range"
              min={32}
              max={96}
              value={options.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="w-full accent-[var(--color-primary)]"
            />
          </Field>

          <Field label="Auto-fit text">
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
          </Field>
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

export { DEFAULT_THEME_FIELDS };
