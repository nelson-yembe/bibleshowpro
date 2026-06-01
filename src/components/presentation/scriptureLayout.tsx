import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scripture body always occupies this share of the presentation area (width + height). */
export const SCRIPTURE_FRAME_PERCENT = 85;

export const scriptureFrameStyle: CSSProperties = {
  width: `${SCRIPTURE_FRAME_PERCENT}%`,
  height: `${SCRIPTURE_FRAME_PERCENT}%`,
  maxWidth: `${SCRIPTURE_FRAME_PERCENT}%`,
  maxHeight: `${SCRIPTURE_FRAME_PERCENT}%`,
};

interface ScriptureFrameProps {
  children: ReactNode;
  className?: string;
  align?: "center" | "start" | "end";
  /** Content box size as % of slide (theme maxContentWidth). */
  sizePercent?: number;
}

/** Centers scripture content in a bounded box so text wraps and auto-fits. */
export function ScriptureFrame({
  children,
  className,
  align = "center",
  sizePercent = SCRIPTURE_FRAME_PERCENT,
}: ScriptureFrameProps) {
  const alignClass =
    align === "start" ? "items-start" : align === "end" ? "items-end" : "items-center";
  const boxStyle: CSSProperties = {
    width: `${sizePercent}%`,
    height: `${sizePercent}%`,
    maxWidth: `${sizePercent}%`,
    maxHeight: `${sizePercent}%`,
  };

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-1 justify-center", alignClass, className)}>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={boxStyle}>
        {children}
      </div>
    </div>
  );
}
