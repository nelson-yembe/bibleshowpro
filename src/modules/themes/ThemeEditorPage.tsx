import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  MoreVertical,
  Plus,
  Save,
  Star,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Segmented } from "@/components/ui/pill";
import { contrastRatio, cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/themeStore";
import type { ThemeConfig } from "@/lib/themeConfig";
import {
  FONT_OPTIONS,
  mergeThemeConfig,
  themeToDisplayDefaults,
  colorPickerValue,
} from "@/lib/themeConfig";
import {
  OUTPUT_MODES,
  createDefaultCanvas,
  createThemeDocument,
  outputModeDef,
  parseThemeDocument,
  type OutputMode,
  type ThemeCanvas,
  type ThemeDocument,
  type ThemeMeta,
} from "@/lib/themeDocument";
import { THEME_PRESETS, presetToConfig } from "@/modules/themes/themePresets";
import { ThemeLowerThirdPanel } from "@/modules/themes/ThemeLowerThirdPanel";
import { previewSceneForTab, themeSwatchStyle, type PreviewTab } from "@/modules/themes/themePreview";
import { VectorDesignPanel, applyVectorTemplate } from "@/modules/themes/vector/VectorDesignPanel";
import { VectorLayerList, VectorToolbar } from "@/modules/themes/vector/VectorToolbar";
import { ThemeStage } from "@/modules/themes/vector/ThemeStage";
import type { VectorDesign, VectorTool } from "@/lib/vectorDesign";
import {
  deleteVectorElement,
  duplicateVectorElement,
  mergeVectorDesign,
  reorderVectorElement,
  updateVectorElement,
} from "@/lib/vectorDesign";

const PROJECTOR_MODE: OutputMode = "projectorFullscreen";

function outputModePreviewTab(mode: OutputMode): PreviewTab {
  switch (mode) {
    case "lyricsSlide":
      return "Song Lyric";
    case "announcement":
      return "Announcement";
    case "lowerThird":
    case "speakerLowerThird":
      return "Lower Third";
    case "countdown":
      return "Blank / Logo";
    default:
      return "Scripture";
  }
}

const previewTabs: PreviewTab[] = [
  "Scripture",
  "Song Lyric",
  "Announcement",
  "Lower Third",
  "Blank / Logo",
];

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
      <p className="mb-1 text-[11px] text-[var(--color-subtle)]">{label}</p>
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

export function ThemeEditorPage() {
  const {
    themes,
    activeTheme,
    activeThemeId,
    loadThemes,
    saveThemeDocument,
    selectTheme,
    deleteTheme,
    createTheme,
    duplicateTheme,
    setDefaultTheme,
    applyThemeLive,
    exportThemeJson,
    importThemeFromJson,
  } = useThemeStore();

  const initialDoc = useMemo(() => createThemeDocument(activeTheme), [activeTheme]);
  const [name, setName] = useState("Untitled theme");
  const [draft, setDraft] = useState<ThemeConfig>(() => initialDoc.base);
  const [canvases, setCanvases] = useState<ThemeCanvas[]>(() => initialDoc.canvases);
  const [meta, setMeta] = useState<ThemeMeta>(() => initialDoc.meta);
  const [outputMode, setOutputMode] = useState<OutputMode>(PROJECTOR_MODE);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("Scripture");
  const [search, setSearch] = useState("");
  const [libraryTab, setLibraryTab] = useState<"themes" | "presets">("themes");
  const [editorMode, setEditorMode] = useState<"style" | "vector">("style");
  const [vectorTool, setVectorTool] = useState<VectorTool>("select");
  const [selectedVectorId, setSelectedVectorId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const loadedThemeIdRef = useRef<string | undefined>(undefined);

  const patch = useCallback((partial: Partial<ThemeConfig>) => {
    setDraft((prev) => mergeThemeConfig({ ...prev, ...partial }));
  }, []);

  const activeCanvas = useMemo(
    () => canvases.find((c) => c.outputMode === outputMode) ?? createDefaultCanvas(outputMode),
    [canvases, outputMode],
  );

  // The vector design currently being edited. The projector canvas is backed by
  // base.vectorDesign (so it keeps driving live output unchanged); every other
  // output mode is backed by its own ThemeCanvas.layers.
  const activeDesign: VectorDesign = useMemo(() => {
    if (outputMode === PROJECTOR_MODE) return draft.vectorDesign;
    return {
      enabled: true,
      viewBoxWidth: activeCanvas.width,
      viewBoxHeight: activeCanvas.height,
      showGrid: draft.vectorDesign.showGrid,
      snapToGrid: draft.vectorDesign.snapToGrid,
      gridSize: draft.vectorDesign.gridSize,
      elements: activeCanvas.layers,
    };
  }, [outputMode, draft.vectorDesign, activeCanvas]);

  const setActiveDesign = useCallback(
    (design: VectorDesign) => {
      if (outputMode === PROJECTOR_MODE) {
        patch({ vectorDesign: design });
        return;
      }
      // Grid prefs are shared globally (stored on base.vectorDesign).
      setDraft((prev) =>
        mergeThemeConfig({
          ...prev,
          vectorDesign: {
            ...prev.vectorDesign,
            showGrid: design.showGrid,
            snapToGrid: design.snapToGrid,
            gridSize: design.gridSize,
          },
        }),
      );
      setCanvases((prev) =>
        prev.map((c) =>
          c.outputMode === outputMode
            ? {
                ...c,
                width: design.viewBoxWidth,
                height: design.viewBoxHeight,
                layers: design.elements,
                enabled: design.elements.length > 0,
              }
            : c,
        ),
      );
    },
    [outputMode, patch],
  );

  const patchVector = setActiveDesign;

  const selectedVector = useMemo(
    () => activeDesign.elements.find((el) => el.id === selectedVectorId) ?? null,
    [activeDesign.elements, selectedVectorId],
  );

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  // Only reset the draft when the user picks a different saved theme — not on every list refresh.
  useEffect(() => {
    if (activeThemeId === loadedThemeIdRef.current) return;
    loadedThemeIdRef.current = activeThemeId;
    const theme = themes.find((t) => t.id === activeThemeId);
    const doc = theme ? parseThemeDocument(theme.config_json) : createThemeDocument(activeTheme);
    setDraft(doc.base);
    setCanvases(doc.canvases);
    setMeta(doc.meta);
    setName(theme?.name ?? "Untitled theme");
  }, [activeTheme, activeThemeId, themes]);

  const filteredThemes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => t.name.toLowerCase().includes(q));
  }, [themes, search]);

  const ratio = contrastRatio(draft.textColor, draft.backgroundColor);
  const readable = ratio >= 4.5;
  const effectivePreviewTab = editorMode === "vector" ? outputModePreviewTab(outputMode) : previewTab;
  const previewScene = useMemo(
    () => previewSceneForTab(effectivePreviewTab, draft),
    [effectivePreviewTab, draft],
  );
  const previewDisplayOptions = useMemo(
    () => ({ ...themeToDisplayDefaults(draft), backgroundPreset: "theme" as const }),
    [draft],
  );

  const currentRecord = themes.find((t) => t.id === activeThemeId);
  const isDefault = currentRecord?.is_default ?? false;
  const savedDoc = useMemo(
    () => (currentRecord ? parseThemeDocument(currentRecord.config_json) : null),
    [currentRecord],
  );
  const isDirty =
    !savedDoc ||
    JSON.stringify(draft) !== JSON.stringify(savedDoc.base) ||
    JSON.stringify(canvases) !== JSON.stringify(savedDoc.canvases) ||
    name !== currentRecord?.name;

  const handleSave = async (asNew = false) => {
    const doc: ThemeDocument = { schemaVersion: 2, meta, base: draft, canvases };
    await saveThemeDocument(name, doc, asNew ? undefined : activeThemeId);
  };

  const handleMediaPick = (type: "image" | "video", file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    patch({
      backgroundType: type,
      ...(type === "image"
        ? { backgroundImage: url, backgroundVideo: undefined }
        : { backgroundVideo: url, backgroundImage: undefined }),
    });
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        breadcrumbs={["Themes", name]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyThemeLive(draft)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-light)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              title="Apply to live presentation without saving"
            >
              <Zap className="h-3.5 w-3.5" />
              Apply live
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              className="rounded-lg border border-[var(--color-border-light)] px-3 py-1.5 text-xs text-[var(--color-muted-foreground)]"
            >
              Save as new...
            </button>
            <button
              type="button"
              disabled={!isDirty && !!activeThemeId}
              onClick={() => void handleSave(false)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save changes
            </button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] p-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search themes..."
              className="h-8 w-full rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] px-3 text-xs placeholder:text-[var(--color-subtle)] focus:outline-none"
            />
          </div>
          <div className="flex gap-1 border-b border-[var(--color-border)] p-2">
            {(["themes", "presets"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLibraryTab(tab)}
                className={cn(
                  "flex-1 rounded-md py-1 text-[10px] font-medium capitalize",
                  libraryTab === tab
                    ? "bg-[var(--color-panel)] text-[var(--color-foreground)]"
                    : "text-[var(--color-subtle)]",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {libraryTab === "themes" ? (
              filteredThemes.map((theme) => (
                <div key={theme.id} className="relative mb-1.5">
                  <button
                    type="button"
                    onClick={() => selectTheme(theme.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border p-2 pr-8 text-left transition-colors",
                      theme.id === activeThemeId
                        ? "border-[var(--color-primary)] bg-blue-950/20"
                        : "border-[var(--color-border-light)] hover:bg-[var(--color-panel)]",
                    )}
                  >
                    <div
                      className="h-8 w-10 shrink-0 rounded border border-[var(--color-border-light)]"
                      style={{ background: themeSwatchStyle(theme.config_json) }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{theme.name}</p>
                      <p className="flex items-center gap-1 text-[10px] text-[var(--color-subtle)]">
                        {theme.is_default && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                        {theme.is_default ? "Default" : "Custom"}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(menuOpen === theme.id ? null : theme.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-subtle)] hover:bg-[var(--color-panel)]"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                  {menuOpen === theme.id && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] py-1 shadow-lg">
                      <MenuAction icon={Copy} label="Duplicate" onClick={() => void duplicateTheme(theme.id)} />
                      {!theme.is_default && (
                        <MenuAction icon={Star} label="Set default" onClick={() => void setDefaultTheme(theme.id)} />
                      )}
                      {activeThemeId && (
                        <MenuAction
                          icon={Download}
                          label="Export JSON"
                          onClick={() => {
                            const json = exportThemeJson(theme.id);
                            if (!json) return;
                            const blob = new Blob([json], { type: "application/json" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `${theme.name.replace(/\s+/g, "-").toLowerCase()}.json`;
                            a.click();
                          }}
                        />
                      )}
                      {!theme.is_default && (
                        <MenuAction
                          icon={Trash2}
                          label="Delete"
                          danger
                          onClick={() => void deleteTheme(theme.id)}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    const presetDoc = createThemeDocument(presetToConfig(preset));
                    setDraft(presetDoc.base);
                    setCanvases(presetDoc.canvases);
                    setMeta(presetDoc.meta);
                    setName(preset.name);
                  }}
                  className="mb-1.5 w-full rounded-lg border border-[var(--color-border-light)] p-2 text-left hover:border-[var(--color-primary)] hover:bg-[var(--color-panel)]"
                >
                  <p className="text-xs font-medium">{preset.name}</p>
                  <p className="text-[10px] text-[var(--color-subtle)]">{preset.description}</p>
                </button>
              ))
            )}
          </div>

          <div className="space-y-2 border-t border-[var(--color-border)] p-3">
            <button
              type="button"
              onClick={() => void createTheme("New theme")}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border-light)] py-2 text-xs text-[var(--color-subtle)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Plus className="h-3.5 w-3.5" />
              New theme
            </button>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-[var(--color-border-light)] py-2 text-xs text-[var(--color-subtle)] hover:text-[var(--color-foreground)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Import JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => void importThemeFromJson(String(reader.result));
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--color-background)]">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={[
                  { value: "style", label: "Style" },
                  { value: "vector", label: "Vector design" },
                ]}
                value={editorMode}
                onChange={(v) => setEditorMode(v as "style" | "vector")}
              />
              {editorMode === "style" ? (
                previewTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPreviewTab(tab)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium",
                      previewTab === tab
                        ? "bg-[var(--color-panel)] text-[var(--color-foreground)]"
                        : "text-[var(--color-subtle)] hover:text-[var(--color-muted-foreground)]",
                    )}
                  >
                    {tab}
                  </button>
                ))
              ) : (
                <>
                  <select
                    value={outputMode}
                    onChange={(e) => {
                      setOutputMode(e.target.value as OutputMode);
                      setSelectedVectorId(null);
                    }}
                    className="h-7 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-[11px]"
                    title="Output mode"
                  >
                    {OUTPUT_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <VectorToolbar
                    tool={vectorTool}
                    onToolChange={setVectorTool}
                    hasSelection={!!selectedVectorId}
                    onDelete={() => {
                      if (!selectedVectorId) return;
                      patchVector(deleteVectorElement(activeDesign, selectedVectorId));
                      setSelectedVectorId(null);
                    }}
                    onDuplicate={() => {
                      if (!selectedVectorId) return;
                      const next = duplicateVectorElement(activeDesign, selectedVectorId);
                      patchVector(next);
                      const newest = next.elements[next.elements.length - 1];
                      if (newest) setSelectedVectorId(newest.id);
                    }}
                    onBringForward={() => {
                      if (!selectedVectorId) return;
                      patchVector(reorderVectorElement(activeDesign, selectedVectorId, "up"));
                    }}
                    onSendBackward={() => {
                      if (!selectedVectorId) return;
                      patchVector(reorderVectorElement(activeDesign, selectedVectorId, "down"));
                    }}
                  />
                </>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            <ThemeStage
              scene={previewScene}
              displayOptions={previewDisplayOptions}
              editing={editorMode === "vector"}
              design={activeDesign}
              tool={vectorTool}
              selectedId={selectedVectorId}
              onSelect={setSelectedVectorId}
              onChange={patchVector}
              safeMargins={activeCanvas.safeMargins}
              canvasWidth={activeCanvas.width}
              canvasHeight={activeCanvas.height}
              outputLabel={outputModeDef(outputMode).label}
              contrastRatio={ratio}
              contrastWarn={!readable && effectivePreviewTab !== "Lower Third"}
            />
            <p className="shrink-0 text-center text-[10px] text-[var(--color-subtle)]">
              {outputModeDef(outputMode).label} · {activeCanvas.width}×{activeCanvas.height} ·{" "}
              {draft.fontSize}pt · {draft.fontFamily.split(",")[0]} · {ratio.toFixed(1)}:1 contrast{" "}
              {readable ? "✓" : "⚠"}
              {isDefault && " · Default theme"}
            </p>
          </div>
        </main>

        <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)]">
          {editorMode === "vector" ? (
            <>
              <div className="border-b border-[var(--color-border)] p-4">
                <p className="section-label mb-1">Output mode</p>
                <select
                  value={outputMode}
                  onChange={(e) => {
                    setOutputMode(e.target.value as OutputMode);
                    setSelectedVectorId(null);
                  }}
                  className="mb-3 h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
                >
                  {OUTPUT_MODES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="mb-3 text-[10px] leading-relaxed text-[var(--color-subtle)]">
                  {outputModeDef(outputMode).description}.
                  {outputMode === PROJECTOR_MODE
                    ? " Drives live program output."
                    : " Saved with the theme for this output."}
                </p>
                <p className="section-label mb-2">Layers</p>
                <VectorLayerList
                  elements={activeDesign.elements}
                  selectedId={selectedVectorId}
                  onSelect={setSelectedVectorId}
                  onReorder={(id, dir) =>
                    patchVector(reorderVectorElement(activeDesign, id, dir))
                  }
                />
              </div>
              <div className="p-4">
                <VectorDesignPanel
                  design={activeDesign}
                  selected={selectedVector}
                  accentColor={draft.accentColor}
                  onDesignChange={patchVector}
                  onElementChange={(id, elPatch) =>
                    patchVector(updateVectorElement(activeDesign, id, elPatch))
                  }
                  onApplyTemplate={(templateId) => {
                    const built = applyVectorTemplate(templateId, draft.accentColor);
                    patchVector(
                      mergeVectorDesign({
                        ...activeDesign,
                        ...built,
                        enabled: true,
                        elements: built.elements ?? [],
                      }),
                    );
                    setSelectedVectorId(null);
                  }}
                />
              </div>
            </>
          ) : (
            <>
          <div className="border-b border-[var(--color-border)] p-4">
            <p className="section-label mb-1.5">Theme name</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-sm font-medium"
            />
          </div>

          <section className="space-y-3 border-b border-[var(--color-border)] p-4">
            <p className="section-label">Background</p>
            <Segmented
              options={[
                { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient" },
                { value: "image", label: "Image" },
                { value: "video", label: "Video" },
              ]}
              value={draft.backgroundType}
              onChange={(v) => patch({ backgroundType: v as ThemeConfig["backgroundType"] })}
            />
            <ColorField label="Base color" value={draft.backgroundColor} onChange={(v) => patch({ backgroundColor: v })} />
            {draft.backgroundType === "gradient" && (
              <>
                <ColorField
                  label="Gradient start"
                  value={draft.backgroundGradient.from}
                  onChange={(v) =>
                    patch({ backgroundGradient: { ...draft.backgroundGradient, from: v } })
                  }
                />
                <ColorField
                  label="Gradient end"
                  value={draft.backgroundGradient.to}
                  onChange={(v) => patch({ backgroundGradient: { ...draft.backgroundGradient, to: v } })}
                />
                <SliderField
                  label="Gradient angle"
                  value={draft.backgroundGradient.angle}
                  min={0}
                  max={360}
                  suffix="°"
                  onChange={(v) => patch({ backgroundGradient: { ...draft.backgroundGradient, angle: v } })}
                />
              </>
            )}
            {(draft.backgroundType === "image" || draft.backgroundType === "video") && (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => imageRef.current?.click()}
                    className="flex-1 rounded-md border border-[var(--color-border-light)] py-1.5 text-[11px]"
                  >
                    Pick image
                  </button>
                  <button
                    type="button"
                    onClick={() => videoRef.current?.click()}
                    className="flex-1 rounded-md border border-[var(--color-border-light)] py-1.5 text-[11px]"
                  >
                    Pick video
                  </button>
                </div>
                {(draft.backgroundImage || draft.backgroundVideo) && (
                  <div className="flex items-center justify-between rounded-md border border-[var(--color-border-light)] px-2 py-1.5 text-[10px] text-[var(--color-subtle)]">
                    <span className="truncate">
                      {draft.backgroundType === "video" && draft.backgroundVideo
                        ? "Video background loaded"
                        : draft.backgroundImage
                          ? "Image background loaded"
                          : "No media selected"}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[var(--color-primary)]"
                      onClick={() =>
                        patch({
                          backgroundImage: undefined,
                          backgroundVideo: undefined,
                          backgroundType: "solid",
                        })
                      }
                    >
                      Clear
                    </button>
                  </div>
                )}
                <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleMediaPick("image", e.target.files?.[0])} />
                <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleMediaPick("video", e.target.files?.[0])} />
                <SliderField
                  label="Overlay darkness"
                  value={Math.round(draft.backgroundOverlay * 100)}
                  min={0}
                  max={90}
                  suffix="%"
                  onChange={(v) => patch({ backgroundOverlay: v / 100 })}
                />
              </>
            )}
          </section>

          <section className="space-y-3 border-b border-[var(--color-border)] p-4">
            <p className="section-label">Typography</p>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Body font</p>
              <select
                value={draft.fontFamily}
                onChange={(e) => patch({ fontFamily: e.target.value })}
                className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <SliderField label="Body size" value={draft.fontSize} min={24} max={96} suffix="pt" onChange={(v) => patch({ fontSize: v })} />
            <SliderField label="Line height" value={draft.lineHeight} min={1} max={2} step={0.05} onChange={(v) => patch({ lineHeight: v })} />
            <SliderField label="Letter spacing" value={draft.letterSpacing} min={-2} max={8} suffix="px" onChange={(v) => patch({ letterSpacing: v })} />
            <SliderField label="Font weight" value={draft.fontWeight} min={300} max={800} step={100} onChange={(v) => patch({ fontWeight: v })} />
            <ColorField label="Text color" value={draft.textColor} onChange={(v) => patch({ textColor: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Text shadow</span>
              <Toggle checked={draft.textShadow} onChange={(v) => patch({ textShadow: v })} />
            </div>
            {draft.textShadow && (
              <ColorField label="Shadow color" value={draft.shadowColor} onChange={(v) => patch({ shadowColor: v })} />
            )}
          </section>

          <section className="space-y-3 border-b border-[var(--color-border)] p-4">
            <p className="section-label">Reference</p>
            <Segmented
              options={[
                { value: "header", label: "Header" },
                { value: "footer", label: "Footer" },
              ]}
              value={draft.referencePosition}
              onChange={(v) => patch({ referencePosition: v as ThemeConfig["referencePosition"] })}
            />
            <Segmented
              options={[
                { value: "normal", label: "Normal" },
                { value: "caps", label: "CAPS" },
                { value: "smallcaps", label: "Small" },
              ]}
              value={draft.referenceStyle}
              onChange={(v) => patch({ referenceStyle: v as ThemeConfig["referenceStyle"] })}
            />
            <ColorField label="Reference color" value={draft.referenceColor} onChange={(v) => patch({ referenceColor: v })} />
            <SliderField label="Reference size" value={draft.referenceFontSize} min={10} max={24} suffix="pt" onChange={(v) => patch({ referenceFontSize: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Show verse numbers</span>
              <Toggle checked={draft.showVerseNumbers} onChange={(v) => patch({ showVerseNumbers: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Show reference on screen</span>
              <Toggle checked={draft.showReference} onChange={(v) => patch({ showReference: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Show translation</span>
              <Toggle checked={draft.showVersion} onChange={(v) => patch({ showVersion: v })} />
            </div>
          </section>

          <section className="space-y-3 border-b border-[var(--color-border)] p-4">
            <p className="section-label">Layout</p>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Text alignment</p>
              <Segmented
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
                value={draft.textAlign}
                onChange={(v) => patch({ textAlign: v as ThemeConfig["textAlign"] })}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-subtle)]">Vertical position</p>
              <Segmented
                options={[
                  { value: "top", label: "Top" },
                  { value: "center", label: "Center" },
                  { value: "bottom", label: "Bottom" },
                ]}
                value={draft.verticalAlign}
                onChange={(v) => patch({ verticalAlign: v as ThemeConfig["verticalAlign"] })}
              />
            </div>
            <SliderField label="Safe area padding" value={draft.padding} min={16} max={160} suffix="px" onChange={(v) => patch({ padding: v })} />
            <SliderField label="Max content width" value={draft.maxContentWidth} min={50} max={100} suffix="%" onChange={(v) => patch({ maxContentWidth: v })} />
            <ColorField label="Accent color" value={draft.accentColor} onChange={(v) => patch({ accentColor: v })} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Auto-fit text</span>
              <Toggle checked={draft.autoFit} onChange={(v) => patch({ autoFit: v })} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-subtle)]">Vector overlays</span>
              <Toggle
                checked={draft.vectorDesign.enabled}
                onChange={(v) => patch({ vectorDesign: { ...draft.vectorDesign, enabled: v } })}
              />
            </div>
            {draft.vectorDesign.enabled && (
              <button
                type="button"
                onClick={() => setEditorMode("vector")}
                className="w-full rounded-md border border-[var(--color-border-light)] py-1.5 text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-panel)]"
              >
                Open vector editor →
              </button>
            )}
          </section>

          <ThemeLowerThirdPanel
            lowerThird={draft.lowerThird}
            onPatch={(ltPatch) => patch({ lowerThird: { ...draft.lowerThird, ...ltPatch } })}
          />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-10 rounded-full transition-colors",
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
  );
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px]",
        danger ? "text-red-400 hover:bg-red-950/30" : "hover:bg-[var(--color-surface)]",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
