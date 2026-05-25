import type { VectorDesign, VectorElement } from "@/lib/vectorDesign";
import { mergeVectorDesign, sortedElements } from "@/lib/vectorDesign";

interface VectorOverlayProps {
  design?: VectorDesign | null;
  layer?: "background" | "foreground" | "all";
  className?: string;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

/** Full-size SVG overlay for presentation slides */
export function VectorOverlay({
  design: rawDesign,
  layer = "all",
  className,
  interactive = false,
  selectedId,
  onSelect,
}: VectorOverlayProps) {
  const design = mergeVectorDesign(rawDesign);
  if (!design.enabled || design.elements.length === 0) return null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${design.viewBoxWidth} ${design.viewBoxHeight}`}
      preserveAspectRatio="none"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
    >
      <VectorElementGroup
        design={design}
        layer={layer}
        interactive={interactive}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </svg>
  );
}

/** Renders vector shapes as SVG group children (for embedding in editor canvas) */
export function VectorElementGroup({
  design: rawDesign,
  layer = "all",
  interactive = false,
  selectedId,
  onSelect,
  extraElements = [],
}: {
  design: VectorDesign;
  layer?: "background" | "foreground" | "all";
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  extraElements?: VectorElement[];
}) {
  const design = mergeVectorDesign(rawDesign);
  const elements = sortedElements([...design.elements, ...extraElements]).filter((el) => {
    if (!el.visible) return false;
    if (layer === "all") return true;
    return el.layer === layer;
  });

  return (
    <>
      {elements.map((el) => (
        <VectorShape
          key={el.id}
          element={el}
          selected={selectedId === el.id}
          interactive={interactive}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function VectorShape({
  element: el,
  selected,
  interactive,
  onSelect,
}: {
  element: VectorElement;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const cx = el.x + (el.width ?? 0) / 2;
  const cy = el.y + (el.height ?? 0) / 2;
  const transform = el.rotation !== 0 ? `rotate(${el.rotation} ${cx} ${cy})` : undefined;

  const handlers = interactive
    ? {
        style: { cursor: el.locked ? "not-allowed" : "pointer" } as React.CSSProperties,
        onPointerDown: (e: React.PointerEvent) => {
          e.stopPropagation();
          if (!el.locked) onSelect?.(el.id);
        },
      }
    : {};

  let shape: React.ReactNode = null;

  switch (el.type) {
    case "rect":
      shape = (
        <rect
          x={el.x}
          y={el.y}
          width={el.width ?? 100}
          height={el.height ?? 100}
          rx={el.rx ?? 0}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
      break;
    case "ellipse":
      shape = (
        <ellipse
          cx={el.x + (el.width ?? 100) / 2}
          cy={el.y + (el.height ?? 100) / 2}
          rx={(el.width ?? 100) / 2}
          ry={(el.height ?? 100) / 2}
          fill={el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
        />
      );
      break;
    case "line":
      shape = (
        <line
          x1={el.x}
          y1={el.y}
          x2={el.x2 ?? el.x}
          y2={el.y2 ?? el.y}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          strokeLinecap="round"
        />
      );
      break;
    case "text":
      shape = (
        <text
          x={el.x}
          y={el.y}
          fill={el.fill}
          fontSize={el.fontSize ?? 48}
          fontFamily={el.fontFamily ?? "Georgia, serif"}
          fontWeight={el.fontWeight ?? 400}
          textAnchor={el.textAnchor ?? "start"}
        >
          {el.text ?? ""}
        </text>
      );
      break;
    case "path":
      shape = (
        <path
          d={el.d ?? ""}
          fill={el.fill === "none" ? "none" : el.fill}
          stroke={el.stroke}
          strokeWidth={el.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
      break;
  }

  return (
    <g opacity={el.opacity} transform={transform} {...handlers}>
      {shape}
      {selected && interactive && <SelectionBox element={el} />}
    </g>
  );
}

function SelectionBox({ element: el }: { element: VectorElement }) {
  const { x, y, w, h } = boundsForSelection(el);
  return (
    <rect
      x={x - 4}
      y={y - 4}
      width={w + 8}
      height={h + 8}
      fill="none"
      stroke="#3b82f6"
      strokeWidth={2}
      strokeDasharray="6 4"
      pointerEvents="none"
    />
  );
}

function boundsForSelection(el: VectorElement) {
  switch (el.type) {
    case "line":
      return {
        x: Math.min(el.x, el.x2 ?? el.x),
        y: Math.min(el.y, el.y2 ?? el.y),
        w: Math.abs((el.x2 ?? el.x) - el.x) || 4,
        h: Math.abs((el.y2 ?? el.y) - el.y) || 4,
      };
    case "text":
      return { x: el.x, y: el.y - (el.fontSize ?? 48), w: 300, h: el.fontSize ?? 48 };
    default:
      return { x: el.x, y: el.y, w: el.width ?? 100, h: el.height ?? 100 };
  }
}
