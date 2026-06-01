import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ensures scripture wraps within its container instead of stretching into one line. */
export const scriptureTextClass =
  "w-full min-w-0 max-w-full select-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

interface AutoFitTextProps {
  children: ReactNode;
  maxFontSize: number;
  minFontSize?: number;
  enabled?: boolean;
  className?: string;
  style?: CSSProperties;
  containerClassName?: string;
  /** Stack multiple block children (e.g. dual translations) and size them together. */
  block?: boolean;
  /** Extra classes for the inner block stack (dual translations). */
  blockClassName?: string;
  /** Hard cap on logical lines — applies clamp if text still overflows at minFontSize. */
  maxLines?: number;
}

/** Binary-search font size so text fits its container (width + height). */
export function AutoFitText({
  children,
  maxFontSize,
  minFontSize = 16,
  enabled = true,
  className,
  style,
  containerClassName,
  block = false,
  blockClassName,
  maxLines,
}: AutoFitTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [clampLines, setClampLines] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) {
      setFontSize(maxFontSize);
      setClampLines(maxLines);
      return;
    }

    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const clearClamp = () => {
      text.style.display = "";
      text.style.webkitLineClamp = "";
      text.style.webkitBoxOrient = "";
      setClampLines(undefined);
    };

    const applyClamp = (lines: number) => {
      text.style.display = "-webkit-box";
      text.style.webkitLineClamp = String(lines);
      text.style.webkitBoxOrient = "vertical";
      text.style.overflow = "hidden";
      setClampLines(lines);
    };

    const fit = () => {
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      if (maxW <= 0 || maxH <= 0) return;

      clearClamp();
      text.style.width = `${maxW}px`;
      text.style.maxWidth = `${maxW}px`;
      text.style.maxHeight = `${maxH}px`;
      text.style.overflow = "hidden";

      let lo = minFontSize;
      let hi = maxFontSize;
      let best = minFontSize;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        text.style.fontSize = `${mid}px`;
        const fits = text.scrollWidth <= maxW + 1 && text.scrollHeight <= maxH + 1;
        if (fits) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      text.style.fontSize = `${best}px`;
      const fitsAtBest = text.scrollWidth <= maxW + 1 && text.scrollHeight <= maxH + 1;

      if (!fitsAtBest && maxLines && maxLines > 0) {
        applyClamp(maxLines);
        text.style.fontSize = `${minFontSize}px`;
        setFontSize(minFontSize);
        return;
      }

      if (!fitsAtBest && best === minFontSize) {
        text.style.overflow = "hidden";
      }

      setFontSize(best);
    };

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [children, maxFontSize, minFontSize, enabled, maxLines]);

  if (!enabled) {
    const Tag = block ? "div" : "p";
    return (
      <Tag
        className={cn(scriptureTextClass, block && "flex w-full flex-col gap-3", blockClassName, className)}
        style={{ ...style, fontSize: maxFontSize }}
      >
        {children}
      </Tag>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 items-center justify-center overflow-hidden",
        containerClassName,
      )}
    >
      <div
        ref={textRef}
        className={cn(
          scriptureTextClass,
          block ? "flex w-full flex-col gap-3" : "",
          blockClassName,
          className,
        )}
        style={{
          ...style,
          fontSize,
          lineHeight: style?.lineHeight ?? 1.35,
          overflowWrap: "anywhere",
          overflow: "hidden",
          maxHeight: "100%",
          ...(clampLines
            ? {
                display: "-webkit-box",
                WebkitLineClamp: clampLines,
                WebkitBoxOrient: "vertical" as const,
              }
            : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function autoFitMaxFontSize(
  themeFontSize: number,
  layout: "fullscreen" | "lower_third",
  compact?: boolean,
  compactVariant?: "panel" | "workspace" | "stage",
  comparison?: boolean,
): number {
  if (compact) {
    const scale = comparison ? 0.42 : 0.55;
    if (compactVariant === "stage") return Math.min(themeFontSize * scale, comparison ? 32 : 42);
    if (compactVariant === "workspace") return Math.min(themeFontSize * (comparison ? 0.3 : 0.38), comparison ? 22 : 28);
    return Math.min(themeFontSize * (comparison ? 0.22 : 0.28), comparison ? 16 : 20);
  }
  if (layout === "lower_third") return themeFontSize;
  if (comparison) return Math.round(themeFontSize * 0.72);
  // Fullscreen projection — cap max so auto-fit has room to shrink long passages.
  return Math.min(themeFontSize, 64);
}

export function autoFitMinFontSize(layout: "fullscreen" | "lower_third", compact?: boolean): number {
  if (compact) return 10;
  return layout === "lower_third" ? 14 : 24;
}
