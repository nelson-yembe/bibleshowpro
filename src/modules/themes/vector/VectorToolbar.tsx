import {
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  GripVertical,
  Minus,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import type { VectorTool } from "@/lib/vectorDesign";
import { cn } from "@/lib/utils";

const TOOLS: { id: VectorTool; label: string; icon: typeof Square }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
  { id: "text", label: "Text", icon: Type },
  { id: "pen", label: "Pen", icon: Pencil },
];

interface VectorToolbarProps {
  tool: VectorTool;
  onToolChange: (tool: VectorTool) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  hasSelection: boolean;
}

export function VectorToolbar({
  tool,
  onToolChange,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  hasSelection,
}: VectorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-panel)] p-1.5">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          onClick={() => onToolChange(id)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            tool === id
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-subtle)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
      <div className="mx-1 h-6 w-px bg-[var(--color-border-light)]" />
      <button
        type="button"
        title="Duplicate"
        disabled={!hasSelection}
        onClick={onDuplicate}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
      >
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Bring forward"
        disabled={!hasSelection}
        onClick={onBringForward}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Send backward"
        disabled={!hasSelection}
        onClick={onSendBackward}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Delete"
        disabled={!hasSelection}
        onClick={onDelete}
        className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-950/30 disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface VectorLayerListProps {
  elements: import("@/lib/vectorDesign").VectorElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder?: (id: string, direction: "up" | "down") => void;
}

export function VectorLayerList({ elements, selectedId, onSelect, onReorder }: VectorLayerListProps) {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  if (sorted.length === 0) {
    return <p className="py-4 text-center text-[11px] text-[var(--color-subtle)]">No vector layers yet</p>;
  }

  return (
    <div className="space-y-1">
      {sorted.map((el) => (
        <div
          key={el.id}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1.5",
            selectedId === el.id
              ? "border-[var(--color-primary)] bg-blue-950/20"
              : "border-[var(--color-border-light)] hover:bg-[var(--color-panel)]",
          )}
        >
          <GripVertical className="h-3 w-3 shrink-0 text-[var(--color-subtle)]" />
          <button
            type="button"
            onClick={() => onSelect(el.id)}
            className="min-w-0 flex-1 truncate text-left text-[11px]"
          >
            {el.name}
            <span className="ml-1 text-[var(--color-subtle)]">({el.type})</span>
          </button>
          {onReorder && (
            <div className="flex shrink-0 gap-0.5">
              <button type="button" onClick={() => onReorder(el.id, "up")} className="rounded p-0.5 hover:bg-[var(--color-surface)]">
                <ArrowUp className="h-3 w-3" />
              </button>
              <button type="button" onClick={() => onReorder(el.id, "down")} className="rounded p-0.5 hover:bg-[var(--color-surface)]">
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
