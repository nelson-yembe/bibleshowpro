import { useCallback, useRef, useState } from "react";
import type { VectorDesign, VectorElement, VectorTool } from "@/lib/vectorDesign";
import {
  createVectorElement,
  hitTestElement,
  mergeVectorDesign,
  snapValue,
  sortedElements,
} from "@/lib/vectorDesign";
import { VectorElementGroup } from "@/components/presentation/VectorOverlay";
import { cn } from "@/lib/utils";

interface VectorEditorCanvasProps {
  design: VectorDesign;
  tool: VectorTool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (design: VectorDesign) => void;
  className?: string;
}

type DragMode =
  | { kind: "none" }
  | { kind: "draw"; startX: number; startY: number }
  | { kind: "move"; id: string; offsetX: number; offsetY: number }
  | { kind: "pen"; points: string[] };

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

export function VectorEditorCanvas({
  design: rawDesign,
  tool,
  selectedId,
  onSelect,
  onChange,
  className,
}: VectorEditorCanvasProps) {
  const design = mergeVectorDesign(rawDesign);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragMode>({ kind: "none" });
  const [draftEl, setDraftEl] = useState<VectorElement | null>(null);

  const snap = useCallback(
    (v: number) => snapValue(v, design.gridSize, design.snapToGrid),
    [design.gridSize, design.snapToGrid],
  );

  const patchDesign = useCallback(
    (patch: Partial<VectorDesign>) => onChange({ ...design, ...patch }),
    [design, onChange],
  );

  const patchElement = useCallback(
    (id: string, patch: Partial<VectorElement>) => {
      patchDesign({
        elements: design.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
      });
    },
    [design.elements, patchDesign],
  );

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const sx = snap(x);
    const sy = snap(y);

    if (tool === "select") {
      const hits = [...sortedElements(design.elements)].reverse();
      const hit = hits.find((el) => !el.locked && hitTestElement(el, sx, sy));
      if (hit) {
        onSelect(hit.id);
        setDrag({ kind: "move", id: hit.id, offsetX: sx - hit.x, offsetY: sy - hit.y });
      } else {
        onSelect(null);
      }
      return;
    }

    if (tool === "pen") {
      setDrag({ kind: "pen", points: [`M ${sx} ${sy}`] });
      return;
    }

    onSelect(null);
    setDrag({ kind: "draw", startX: sx, startY: sy });

    const maxZ = Math.max(0, ...design.elements.map((el) => el.zIndex)) + 1;

    if (tool === "text") {
      const el = createVectorElement("text", { x: sx, y: sy, zIndex: maxZ });
      patchDesign({ enabled: true, elements: [...design.elements, el] });
      onSelect(el.id);
      setDrag({ kind: "none" });
      return;
    }

    let el: VectorElement;
    switch (tool) {
      case "rect":
        el = createVectorElement("rect", { x: sx, y: sy, width: 0, height: 0, zIndex: maxZ });
        break;
      case "ellipse":
        el = createVectorElement("ellipse", { x: sx, y: sy, width: 0, height: 0, zIndex: maxZ });
        break;
      case "line":
        el = createVectorElement("line", { x: sx, y: sy, x2: sx, y2: sy, zIndex: maxZ });
        break;
      default:
        return;
    }
    setDraftEl(el);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || drag.kind === "none") return;
    const { x, y } = clientToSvg(svgRef.current, e.clientX, e.clientY);
    const sx = snap(x);
    const sy = snap(y);

    if (drag.kind === "move") {
      patchElement(drag.id, { x: sx - drag.offsetX, y: sy - drag.offsetY });
      return;
    }

    if (drag.kind === "pen") {
      setDrag({ kind: "pen", points: [...drag.points, `L ${sx} ${sy}`] });
      return;
    }

    if (drag.kind === "draw" && draftEl) {
      const w = Math.max(4, sx - drag.startX);
      const h = Math.max(4, sy - drag.startY);
      if (draftEl.type === "line") {
        setDraftEl({ ...draftEl, x2: sx, y2: sy });
      } else {
        setDraftEl({ ...draftEl, x: drag.startX, y: drag.startY, width: w, height: h });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (drag.kind === "pen" && drag.points.length > 1) {
      const maxZ = Math.max(0, ...design.elements.map((el) => el.zIndex)) + 1;
      const el = createVectorElement("path", {
        x: 0,
        y: 0,
        d: drag.points.join(" "),
        zIndex: maxZ,
      });
      patchDesign({ enabled: true, elements: [...design.elements, el] });
      onSelect(el.id);
    } else if (drag.kind === "draw" && draftEl) {
      const w = draftEl.width ?? 0;
      const h = draftEl.height ?? 0;
      const valid = draftEl.type === "line" ? true : w > 8 && h > 8;
      if (valid) {
        patchDesign({ enabled: true, elements: [...design.elements, draftEl] });
        onSelect(draftEl.id);
      }
    }
    setDrag({ kind: "none" });
    setDraftEl(null);
  };

  const gridLines = design.showGrid
    ? Array.from({ length: Math.ceil(design.viewBoxWidth / design.gridSize) + 1 }, (_, i) => {
        const pos = i * design.gridSize;
        return (
          <g key={`grid-${i}`} opacity={0.15}>
            <line x1={pos} y1={0} x2={pos} y2={design.viewBoxHeight} stroke="#64748b" strokeWidth={1} />
            <line x1={0} y1={pos} x2={design.viewBoxWidth} y2={pos} stroke="#64748b" strokeWidth={1} />
          </g>
        );
      })
    : null;

  const penPreview =
    drag.kind === "pen" ? (
      <path d={drag.points.join(" ")} fill="none" stroke="#3b82f6" strokeWidth={3} strokeLinecap="round" />
    ) : null;

  return (
    <svg
      ref={svgRef}
      className={cn("absolute inset-0 z-20 h-full w-full touch-none", className)}
      viewBox={`0 0 ${design.viewBoxWidth} ${design.viewBoxHeight}`}
      preserveAspectRatio="none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {gridLines}
      <VectorElementGroup
        design={design}
        layer="all"
        interactive
        selectedId={selectedId}
        onSelect={onSelect}
        extraElements={draftEl ? [draftEl] : []}
      />
      {penPreview}
    </svg>
  );
}
