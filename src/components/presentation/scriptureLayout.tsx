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
}

/** Centers scripture content in an 85% × 85% box so text wraps and auto-fits within fixed bounds. */
export function ScriptureFrame({ children, className, align = "center" }: ScriptureFrameProps) {
  const alignClass =
    align === "start" ? "items-start" : align === "end" ? "items-end" : "items-center";

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-1 justify-center", alignClass, className)}>
      <div
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={scriptureFrameStyle}
      >
        {children}
      </div>
    </div>
  );
}
