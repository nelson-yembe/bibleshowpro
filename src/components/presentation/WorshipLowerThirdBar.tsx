import type { CSSProperties, ReactNode } from "react";
import type { LowerThirdStyle } from "@/lib/themeConfig";
import type { LowerThirdBarDimensions } from "@/lib/lowerThird";
import { lowerThirdBarDimensions, lowerThirdContentLayout } from "@/lib/lowerThird";
import { WorshipGoldBorder } from "@/components/presentation/WorshipLowerThirdDecor";
import { cn } from "@/lib/utils";

interface WorshipLowerThirdBarProps {
  lt: LowerThirdStyle;
  compact?: boolean;
  compactVariant?: "panel" | "workspace" | "stage";
  animationClass?: string;
  transparentOnOutput?: boolean;
  referenceNode?: ReactNode;
  referencePlacement?: LowerThirdStyle["referencePlacement"];
  barBox?: LowerThirdBarDimensions;
  children: ReactNode;
}

export function WorshipLowerThirdBar({
  lt,
  compact,
  compactVariant,
  animationClass,
  transparentOnOutput,
  referenceNode,
  referencePlacement,
  barBox,
  children,
}: WorshipLowerThirdBarProps) {
  const borderPx = compact ? Math.max(lt.accentWidth * 0.5, 2) : lt.accentWidth;
  const gold = lt.accentGoldColor;
  const dimensions = barBox ?? lowerThirdBarDimensions(lt, { compact, compactVariant });
  const contentLayout = lowerThirdContentLayout(lt);

  const showBarFill = lt.barOpacity > 0.01;
  const gradientBg = showBarFill
    ? `linear-gradient(${lt.barGradient.angle}deg, ${lt.barGradient.from}, ${lt.barGradient.to})`
    : "transparent";

  const sidePad = compact ? lt.paddingX * 0.35 : lt.paddingX;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        animationClass,
        transparentOnOutput && compact && "outline outline-1 outline-dashed outline-emerald-500/40",
      )}
      style={dimensions.boxStyle}
    >
      <div
        className="absolute inset-0"
        style={{
          background: gradientBg,
          opacity: lt.barOpacity,
        }}
      />

      {showBarFill && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 120% at 50% 50%, transparent 40%, rgba(0,0,0,0.25) 100%)",
          }}
        />
      )}

      {lt.showAccent && <WorshipGoldBorder position="top" thickness={borderPx} gold={gold} />}
      {lt.showBottomAccent && <WorshipGoldBorder position="bottom" thickness={borderPx} gold={gold} />}

      <div
        className="relative z-[4] flex h-full min-h-0 flex-col items-center justify-center overflow-hidden"
        style={{
          paddingLeft: sidePad,
          paddingRight: sidePad,
          paddingTop: compact ? lt.paddingY * 0.4 + borderPx : lt.paddingY + borderPx,
          paddingBottom: compact ? lt.paddingY * 0.4 + borderPx : lt.paddingY + borderPx,
        }}
      >
        {referenceNode && referencePlacement === "above" && (
          <div className={cn("mb-2 shrink-0", contentLayout.className)} style={contentLayout.style}>
            {referenceNode}
          </div>
        )}

        <div
          className={cn(
            "flex min-h-0 items-center justify-center overflow-hidden",
            contentLayout.className,
          )}
          style={{ ...contentLayout.style, flex: "1 1 0" }}
        >
          {children}
        </div>

        {referenceNode && referencePlacement === "below" && (
          <div className={cn("mt-2 shrink-0", contentLayout.className)} style={contentLayout.style}>
            {referenceNode}
          </div>
        )}
      </div>
    </div>
  );
}

export function worshipTextStyle(
  lt: LowerThirdStyle,
  themeTextColor: string,
  baseStyle: CSSProperties,
  autoFit = false,
): CSSProperties {
  const family = lt.fontFamily?.trim() || undefined;
  const style: CSSProperties = {
    ...baseStyle,
    color: themeTextColor,
    fontFamily: family,
    fontWeight: lt.fontWeight,
    lineHeight: 1.65,
    letterSpacing: "0.01em",
    textShadow: lt.textShadow
      ? "0 2px 8px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)"
      : baseStyle.textShadow,
    whiteSpace: "pre-line",
    overflow: "hidden",
  };

  if (!autoFit && lt.maxLines > 0) {
    style.display = "-webkit-box";
    style.WebkitLineClamp = lt.maxLines;
    style.WebkitBoxOrient = "vertical";
  } else {
    style.display = "block";
  }

  return style;
}
