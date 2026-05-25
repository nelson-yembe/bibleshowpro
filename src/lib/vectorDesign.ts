/** SVG vector layer stored inside theme.config_json */

export type VectorElementType = "rect" | "ellipse" | "line" | "text" | "path";
export type VectorLayer = "background" | "foreground";
export type VectorTool = "select" | "rect" | "ellipse" | "line" | "text" | "pen";

export interface VectorElement {
  id: string;
  name: string;
  type: VectorElementType;
  /** Canvas coordinates — viewBox 0..1920 × 0..1080 */
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  layer: VectorLayer;
  rx?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAnchor?: "start" | "middle" | "end";
  /** SVG path d — coordinates in viewBox space */
  d?: string;
}

export interface VectorDesign {
  enabled: boolean;
  viewBoxWidth: number;
  viewBoxHeight: number;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  elements: VectorElement[];
}

export const VECTOR_VIEWBOX = { width: 1920, height: 1080 } as const;

export const DEFAULT_VECTOR_DESIGN: VectorDesign = {
  enabled: false,
  viewBoxWidth: VECTOR_VIEWBOX.width,
  viewBoxHeight: VECTOR_VIEWBOX.height,
  showGrid: true,
  snapToGrid: true,
  gridSize: 40,
  elements: [],
};

export function mergeVectorDesign(partial?: Partial<VectorDesign> | null): VectorDesign {
  if (!partial) return { ...DEFAULT_VECTOR_DESIGN, elements: [] };
  return {
    ...DEFAULT_VECTOR_DESIGN,
    ...partial,
    elements: partial.elements ?? [],
  };
}

export function newVectorId(): string {
  return `vec-${crypto.randomUUID().slice(0, 8)}`;
}

export function snapValue(value: number, grid: number, enabled: boolean): number {
  if (!enabled || grid <= 0) return Math.round(value);
  return Math.round(value / grid) * grid;
}

export function sortedElements(elements: VectorElement[]): VectorElement[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

export function createVectorElement(
  type: VectorElementType,
  partial: Partial<VectorElement> & Pick<VectorElement, "x" | "y">,
): VectorElement {
  const base: VectorElement = {
    id: newVectorId(),
    name: type.charAt(0).toUpperCase() + type.slice(1),
    type,
    x: partial.x,
    y: partial.y,
    rotation: 0,
    opacity: 1,
    fill: "#2563eb",
    stroke: "#ffffff",
    strokeWidth: 0,
    visible: true,
    locked: false,
    zIndex: partial.zIndex ?? 1,
    layer: partial.layer ?? "background",
  };

  switch (type) {
    case "rect":
      return {
        ...base,
        width: partial.width ?? 320,
        height: partial.height ?? 120,
        rx: partial.rx ?? 8,
        fill: partial.fill ?? "rgba(37,99,235,0.35)",
        stroke: partial.stroke ?? "#3b82f6",
        strokeWidth: partial.strokeWidth ?? 2,
        ...partial,
      };
    case "ellipse":
      return {
        ...base,
        width: partial.width ?? 200,
        height: partial.height ?? 200,
        fill: partial.fill ?? "rgba(99,102,241,0.25)",
        stroke: partial.stroke ?? "#818cf8",
        strokeWidth: partial.strokeWidth ?? 2,
        ...partial,
      };
    case "line":
      return {
        ...base,
        x2: partial.x2 ?? partial.x + 200,
        y2: partial.y2 ?? partial.y,
        stroke: partial.stroke ?? "#f8fafc",
        strokeWidth: partial.strokeWidth ?? 4,
        fill: "none",
        ...partial,
      };
    case "text":
      return {
        ...base,
        text: partial.text ?? "Your text",
        fontSize: partial.fontSize ?? 48,
        fontFamily: partial.fontFamily ?? "Georgia, serif",
        fontWeight: partial.fontWeight ?? 600,
        textAnchor: partial.textAnchor ?? "start",
        fill: partial.fill ?? "#f8fafc",
        stroke: "none",
        ...partial,
      };
    case "path":
      return {
        ...base,
        d: partial.d ?? `M ${partial.x} ${partial.y}`,
        fill: partial.fill ?? "none",
        stroke: partial.stroke ?? "#f8fafc",
        strokeWidth: partial.strokeWidth ?? 3,
        ...partial,
      };
    default:
      return { ...base, ...partial };
  }
}

export function updateVectorElement(
  design: VectorDesign,
  id: string,
  patch: Partial<VectorElement>,
): VectorDesign {
  return {
    ...design,
    elements: design.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
  };
}

export function deleteVectorElement(design: VectorDesign, id: string): VectorDesign {
  return { ...design, elements: design.elements.filter((el) => el.id !== id) };
}

export function duplicateVectorElement(design: VectorDesign, id: string): VectorDesign {
  const source = design.elements.find((el) => el.id === id);
  if (!source) return design;
  const maxZ = Math.max(0, ...design.elements.map((e) => e.zIndex));
  const copy: VectorElement = {
    ...source,
    id: newVectorId(),
    name: `${source.name} copy`,
    x: source.x + 24,
    y: source.y + 24,
    zIndex: maxZ + 1,
  };
  return { ...design, elements: [...design.elements, copy] };
}

export function reorderVectorElement(
  design: VectorDesign,
  id: string,
  direction: "up" | "down" | "front" | "back",
): VectorDesign {
  const sorted = sortedElements(design.elements);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx === -1) return design;

  const reordered = [...sorted];
  if (direction === "front") reordered.push(reordered.splice(idx, 1)[0]);
  else if (direction === "back") reordered.unshift(reordered.splice(idx, 1)[0]);
  else if (direction === "up" && idx < reordered.length - 1) {
    [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
  } else if (direction === "down" && idx > 0) {
    [reordered[idx], reordered[idx - 1]] = [reordered[idx - 1], reordered[idx]];
  }

  return {
    ...design,
    elements: reordered.map((el, i) => ({ ...el, zIndex: i + 1 })),
  };
}

export function elementBounds(el: VectorElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case "line":
      return {
        x: Math.min(el.x, el.x2 ?? el.x),
        y: Math.min(el.y, el.y2 ?? el.y),
        w: Math.abs((el.x2 ?? el.x) - el.x) || 4,
        h: Math.abs((el.y2 ?? el.y) - el.y) || 4,
      };
    case "text":
      return { x: el.x, y: el.y - (el.fontSize ?? 48), w: 400, h: el.fontSize ?? 48 };
    default:
      return { x: el.x, y: el.y, w: el.width ?? 100, h: el.height ?? 100 };
  }
}

export function hitTestElement(el: VectorElement, px: number, py: number): boolean {
  if (!el.visible) return false;
  const pad = 8;
  const { x, y, w, h } = elementBounds(el);
  return px >= x - pad && px <= x + w + pad && py >= y - pad && py <= y + h + pad;
}
