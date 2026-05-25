import { Segmented } from "@/components/ui/pill";
import type { VectorDesign, VectorElement } from "@/lib/vectorDesign";
import { FONT_OPTIONS } from "@/lib/themeConfig";
import { VECTOR_TEMPLATES, applyVectorTemplate } from "@/modules/themes/vector/vectorTemplates";

interface VectorDesignPanelProps {
  design: VectorDesign;
  selected: VectorElement | null;
  accentColor: string;
  onDesignChange: (design: VectorDesign) => void;
  onElementChange: (id: string, patch: Partial<VectorElement>) => void;
  onApplyTemplate: (templateId: string) => void;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-[var(--color-subtle)]">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#2563eb"}
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

function SliderInput({
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

export function VectorDesignPanel({
  design,
  selected,
  accentColor,
  onDesignChange,
  onElementChange,
  onApplyTemplate,
}: VectorDesignPanelProps) {
  return (
    <div className="space-y-4">
      <section className="space-y-3 border-b border-[var(--color-border)] pb-4">
        <p className="section-label">Vector layer</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-subtle)]">Enable on slides</span>
          <Toggle
            checked={design.enabled}
            onChange={(v) => onDesignChange({ ...design, enabled: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-subtle)]">Show grid</span>
          <Toggle
            checked={design.showGrid}
            onChange={(v) => onDesignChange({ ...design, showGrid: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-subtle)]">Snap to grid</span>
          <Toggle
            checked={design.snapToGrid}
            onChange={(v) => onDesignChange({ ...design, snapToGrid: v })}
          />
        </div>
        <SliderInput
          label="Grid size"
          value={design.gridSize}
          min={10}
          max={80}
          suffix="px"
          onChange={(v) => onDesignChange({ ...design, gridSize: v })}
        />
      </section>

      <section className="space-y-2 border-b border-[var(--color-border)] pb-4">
        <p className="section-label">Templates</p>
        {VECTOR_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onApplyTemplate(tpl.id)}
            className="w-full rounded-lg border border-[var(--color-border-light)] p-2 text-left hover:border-[var(--color-primary)] hover:bg-[var(--color-panel)]"
          >
            <p className="text-xs font-medium">{tpl.name}</p>
            <p className="text-[10px] text-[var(--color-subtle)]">{tpl.description}</p>
          </button>
        ))}
        <p className="text-[10px] text-[var(--color-subtle)]">
          Templates use accent {accentColor}
        </p>
      </section>

      {selected ? (
        <section className="space-y-3">
          <p className="section-label">Selected: {selected.name}</p>
          <div>
            <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Name</p>
            <input
              value={selected.name}
              onChange={(e) => onElementChange(selected.id, { name: e.target.value })}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            />
          </div>
          <Segmented
            options={[
              { value: "background", label: "Behind text" },
              { value: "foreground", label: "In front" },
            ]}
            value={selected.layer}
            onChange={(v) => onElementChange(selected.id, { layer: v as VectorElement["layer"] })}
          />
          <ColorInput
            label="Fill"
            value={selected.fill}
            onChange={(v) => onElementChange(selected.id, { fill: v })}
          />
          <ColorInput
            label="Stroke"
            value={selected.stroke}
            onChange={(v) => onElementChange(selected.id, { stroke: v })}
          />
          <SliderInput
            label="Stroke width"
            value={selected.strokeWidth}
            min={0}
            max={24}
            onChange={(v) => onElementChange(selected.id, { strokeWidth: v })}
          />
          <SliderInput
            label="Opacity"
            value={Math.round(selected.opacity * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => onElementChange(selected.id, { opacity: v / 100 })}
          />
          <SliderInput
            label="Rotation"
            value={selected.rotation}
            min={-180}
            max={180}
            suffix="°"
            onChange={(v) => onElementChange(selected.id, { rotation: v })}
          />
          {(selected.type === "rect" || selected.type === "ellipse") && (
            <>
              <SliderInput
                label="Width"
                value={Math.round(selected.width ?? 100)}
                min={4}
                max={1920}
                onChange={(v) => onElementChange(selected.id, { width: v })}
              />
              <SliderInput
                label="Height"
                value={Math.round(selected.height ?? 100)}
                min={4}
                max={1080}
                onChange={(v) => onElementChange(selected.id, { height: v })}
              />
            </>
          )}
          {selected.type === "rect" && (
            <SliderInput
              label="Corner radius"
              value={selected.rx ?? 0}
              min={0}
              max={80}
              onChange={(v) => onElementChange(selected.id, { rx: v })}
            />
          )}
          {selected.type === "text" && (
            <>
              <div>
                <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Text</p>
                <textarea
                  value={selected.text ?? ""}
                  onChange={(e) => onElementChange(selected.id, { text: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1 text-xs"
                />
              </div>
              <SliderInput
                label="Font size"
                value={selected.fontSize ?? 48}
                min={12}
                max={120}
                onChange={(v) => onElementChange(selected.id, { fontSize: v })}
              />
              <div>
                <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Font</p>
                <select
                  value={selected.fontFamily ?? FONT_OPTIONS[0].value}
                  onChange={(e) => onElementChange(selected.id, { fontFamily: e.target.value })}
                  className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <Segmented
                options={[
                  { value: "start", label: "Left" },
                  { value: "middle", label: "Center" },
                  { value: "end", label: "Right" },
                ]}
                value={selected.textAnchor ?? "start"}
                onChange={(v) =>
                  onElementChange(selected.id, { textAnchor: v as VectorElement["textAnchor"] })
                }
              />
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-subtle)]">Locked</span>
            <Toggle
              checked={selected.locked}
              onChange={(v) => onElementChange(selected.id, { locked: v })}
            />
          </div>
        </section>
      ) : (
        <p className="text-[11px] text-[var(--color-subtle)]">
          Select a shape on the canvas or pick a template to start designing.
        </p>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-10 rounded-full transition-colors ${checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border-light)]"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export { applyVectorTemplate };
