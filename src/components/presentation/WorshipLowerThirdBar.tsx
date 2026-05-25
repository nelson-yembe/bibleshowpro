import type { CSSProperties, ReactNode } from "react";
import type { LowerThirdStyle } from "@/lib/themeConfig";
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
  children,
}: WorshipLowerThirdBarProps) {
  const scale = compact ? (compactVariant === "stage" ? 0.55 : 0.45) : 1;
  const vhScale = compact ? (compactVariant === "stage" ? 0.38 : 0.28) : 1;
  const borderPx = compact ? Math.max(lt.accentWidth * 0.5, 2) : lt.accentWidth;
  const gold = lt.accentGoldColor;

  const heightStyle: CSSProperties =
    lt.barHeightPercent > 0
      ? {
          height: `${lt.barHeightPercent * vhScale}vh`,
          minHeight: `${lt.barHeightPercent * vhScale}vh`,
        }
      : {
          minHeight: compact ? Math.max(lt.barHeight * scale, 48) : Math.max(lt.barHeight, 80),
        };

  const gradientBg =
    lt.barOpacity > 0.01 && !transparentOnOutput
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
      style={heightStyle}
    >
      <div
        className="absolute inset-0"
        style={{
          background: gradientBg,
          opacity: lt.barOpacity,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 120% at 50% 50%, transparent 40%, rgba(0,0,0,0.25) 100%)",
        }}
      />

      {lt.showAccent && <WorshipGoldBorder position="top" thickness={borderPx} gold={gold} />}
      {lt.showBottomAccent && <WorshipGoldBorder position="bottom" thickness={borderPx} gold={gold} />}

      <div
        className="relative z-[4] flex h-full flex-col items-center justify-center"
        style={{
          paddingLeft: sidePad,
          paddingRight: sidePad,
          paddingTop: compact ? lt.paddingY * 0.4 + borderPx : lt.paddingY + borderPx,
          paddingBottom: compact ? lt.paddingY * 0.4 + borderPx : lt.paddingY + borderPx,
        }}
      >
        {referenceNode && referencePlacement === "above" && (
          <div className="mb-2 shrink-0">{referenceNode}</div>
        )}

        <div className="flex min-h-0 w-full flex-1 items-center justify-center">{children}</div>

        {referenceNode && referencePlacement === "below" && (
          <div className="mt-2 shrink-0">{referenceNode}</div>
        )}
      </div>
    </div>
  );
}

export function worshipTextStyle(lt: LowerThirdStyle, themeTextColor: string, baseStyle: CSSProperties): CSSProperties {
  const family = lt.fontFamily?.trim() || undefined;
  return {
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
    display: "block",
    WebkitLineClamp: undefined,
    WebkitBoxOrient: undefined,
    overflow: "visible",
  };
}
