import type { CSSProperties } from "react";
import type { Scene } from "@/engine/scene";
import { DEFAULT_THEME } from "@/engine/scene";
import type { ThemeConfig } from "@/lib/tauri";
import {
  formatReference,
  mergeThemeConfig,
  themeBackgroundStyle,
} from "@/lib/themeConfig";
import { cn } from "@/lib/utils";
import {
  applyDisplayOptionsToBody,
  backgroundPresets,
  mergeDisplayWithTheme,
  splitHighlight,
  type DisplayOptions,
} from "@/components/presentation/displayOptions";
import { highlightMarkStyle } from "@/components/presentation/highlightStyle";
import { VectorOverlay } from "@/components/presentation/VectorOverlay";
import {
  AutoFitText,
  autoFitMaxFontSize,
  autoFitMinFontSize,
  scriptureTextClass,
} from "@/components/presentation/AutoFitText";
import { ScriptureFrame } from "@/components/presentation/scriptureLayout";
import {
  applyBarColorOpacity,
  lowerThirdAnimationClass,
  lowerThirdMaxFontSize,
} from "@/lib/lowerThird";
import { mediaUrl } from "@/lib/mediaUrl";
import { WorshipLowerThirdBar, worshipTextStyle } from "@/components/presentation/WorshipLowerThirdBar";

interface SceneRendererProps {
  scene: Scene | null;
  className?: string;
  label?: string;
  compact?: boolean;
  compactVariant?: "panel" | "workspace" | "stage";
  displayOptions?: Partial<DisplayOptions>;
  /** Merged into scene theme (e.g. Bible Search lower-third session overrides). */
  themeOverride?: Partial<ThemeConfig>;
  /** Theme editor: always render background from scene.theme, never preset overrides */
  forceThemeBackground?: boolean;
  /** Hide vector overlays (theme editor draws them interactively) */
  hideVectorLayers?: boolean;
}

export function SceneRenderer({
  scene,
  className,
  label,
  compact = false,
  compactVariant = "panel",
  displayOptions,
  themeOverride,
  forceThemeBackground = false,
  hideVectorLayers = false,
}: SceneRendererProps) {
  const rawTheme = mergeThemeConfig({ ...(scene?.theme ?? DEFAULT_THEME), ...themeOverride });
  const opts = mergeDisplayWithTheme(rawTheme, displayOptions);
  const theme = rawTheme;

  const fontSize = compact
    ? compactVariant === "stage"
      ? Math.min(opts.fontSize * 0.42, 38)
      : compactVariant === "workspace"
        ? Math.min(opts.fontSize * 0.32, 26)
        : Math.min(opts.fontSize * 0.22, 18)
    : opts.fontSize;

  const useThemeBg = forceThemeBackground || opts.backgroundPreset === "theme";
  const bgStyle = useThemeBg
    ? themeBackgroundStyle(theme)
    : {
        backgroundColor:
          backgroundPresets[opts.backgroundPreset as keyof typeof backgroundPresets]?.color ??
          theme.backgroundColor,
      };

  if (!scene) {
    return (
      <div className={cn("flex h-full items-center justify-center bg-black text-slate-500", className)}>
        <span className="text-xs">{label ?? "No scene loaded"}</span>
      </div>
    );
  }

  if (scene.type === "blackout") {
    return <div className={cn("h-full bg-black", className)} />;
  }

  if (scene.type === "blank") {
    return (
      <div
        className={cn("h-full", className)}
        style={{ ...themeBackgroundStyle(theme), backgroundColor: theme.backgroundColor }}
      />
    );
  }

  if (scene.type === "image" && scene.content.imagePath) {
    return (
      <div className={cn("relative h-full overflow-hidden bg-black", className)}>
        <img
          src={mediaUrl(scene.content.imagePath)}
          alt={scene.content.title ?? "Image"}
          className="h-full w-full object-contain"
        />
        {scene.content.title && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
            <p className="text-sm font-semibold text-white">{scene.content.title}</p>
          </div>
        )}
      </div>
    );
  }

  if (scene.type === "video" && scene.content.videoPath) {
    return (
      <div className={cn("relative h-full overflow-hidden bg-black", className)}>
        <video
          src={mediaUrl(scene.content.videoPath)}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-contain"
        />
        {scene.content.title && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
            <p className="text-sm font-semibold text-white">{scene.content.title}</p>
          </div>
        )}
      </div>
    );
  }

  if (scene.type === "logo") {
    return (
      <div
        className={cn("relative flex h-full items-center justify-center overflow-hidden", className)}
        style={themeBackgroundStyle(theme)}
      >
        {(theme.backgroundType === "image" || theme.backgroundType === "video") && theme.backgroundOverlay > 0 && (
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.backgroundOverlay})` }} />
        )}
        {theme.backgroundVideo && theme.backgroundType === "video" && (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={theme.backgroundVideo}
            autoPlay
            loop
            muted
            playsInline
          />
        )}
        {!hideVectorLayers && (
          <VectorOverlay
            design={theme.vectorDesign}
            layer="background"
            className="absolute inset-0 z-[2] h-full w-full"
          />
        )}
        <p
          className={cn("relative z-10 font-bold", compact ? "text-lg" : "text-5xl")}
          style={{
            color: theme.textColor,
            fontFamily: theme.fontFamily,
            textShadow: theme.textShadow ? `0 2px 16px ${theme.shadowColor}` : undefined,
          }}
        >
          {scene.content.title ?? "Bible Show Pro"}
        </p>
      </div>
    );
  }

  const isComparison = scene.type === "scripture_comparison" || !!scene.content.comparisonVerse;
  const isLowerThird =
    scene.type === "scripture_lower_third" ||
    scene.type === "speaker_lower_third" ||
    (scene.type === "song_lyrics" && scene.content.layout === "lower_third");
  const layoutMode = isLowerThird ? "lower_third" : "fullscreen";
  const body = applyDisplayOptionsToBody(scene.content.body ?? "", opts);
  const comparisonBody = scene.content.comparisonBody
    ? applyDisplayOptionsToBody(scene.content.comparisonBody, opts)
    : null;
  const comparisonAbbr = scene.content.comparisonVerse?.translation_abbr;
  const alignClass =
    opts.textAlign === "left" ? "text-left" : opts.textAlign === "right" ? "text-right" : "text-center";
  const emphasisClass =
    opts.emphasis === "bold"
      ? "font-bold"
      : opts.emphasis === "glow"
        ? "font-semibold drop-shadow-[0_0_12px_rgba(255,255,255,0.45)]"
        : "";

  const maxFitSize = isLowerThird
    ? lowerThirdMaxFontSize(theme, compact, isComparison)
    : autoFitMaxFontSize(
        opts.fontSize,
        layoutMode,
        compact,
        compactVariant,
        isComparison && !isLowerThird,
      );
  const minFitSize = autoFitMinFontSize(layoutMode, compact);

  const textStyle: CSSProperties = {
    lineHeight: theme.lineHeight,
    letterSpacing: theme.letterSpacing ? `${theme.letterSpacing}px` : undefined,
    fontWeight: theme.fontWeight,
    textShadow: theme.textShadow ? `0 2px 12px ${theme.shadowColor}` : undefined,
    maxWidth: "100%",
    width: "100%",
    overflowWrap: "anywhere",
  };

  const staticFontSize = opts.autoFit ? maxFitSize : fontSize;
  const legacyTextStyle: CSSProperties = {
    ...textStyle,
    fontSize: opts.autoFit && !compact ? `clamp(20px, 3.5vw, ${fontSize}px)` : staticFontSize,
  };

  const isScriptureFullscreen =
    scene.type === "scripture_fullscreen" || scene.type === "scripture_comparison";

  return (
    <div
      className={cn("relative h-full overflow-hidden", className)}
      style={{
        ...bgStyle,
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        padding: compact ? 16 : isScriptureFullscreen ? 0 : theme.padding,
      }}
    >
      {(theme.backgroundType === "image" || theme.backgroundType === "video") && theme.backgroundOverlay > 0 && (
        <div className="absolute inset-0 z-[1]" style={{ backgroundColor: `rgba(0,0,0,${theme.backgroundOverlay})` }} />
      )}
      {theme.backgroundVideo && theme.backgroundType === "video" && (
        <video
          className="absolute inset-0 z-0 h-full w-full object-cover"
          src={theme.backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
        />
      )}

      {!hideVectorLayers && (
        <VectorOverlay
          design={theme.vectorDesign}
          layer="background"
          className="absolute inset-0 z-[2] h-full w-full"
        />
      )}

      {isComparison && !isLowerThird ? (
        <ComparisonLayout
          scene={scene}
          theme={theme}
          opts={opts}
          primaryBody={body}
          secondaryBody={comparisonBody ?? ""}
          primaryAbbr={scene.content.translationAbbr}
          secondaryAbbr={comparisonAbbr}
          compact={compact}
          alignClass={alignClass}
          emphasisClass={emphasisClass}
          textStyle={textStyle}
          legacyTextStyle={legacyTextStyle}
          maxFitSize={maxFitSize}
          minFitSize={minFitSize}
        />
      ) : isLowerThird ? (
        <LowerThirdLayout
          scene={scene}
          theme={theme}
          opts={opts}
          body={body}
          comparisonBody={comparisonBody}
          comparisonAbbr={comparisonAbbr}
          compact={compact}
          compactVariant={compactVariant}
          emphasisClass={emphasisClass}
          textStyle={textStyle}
          maxFitSize={maxFitSize}
          minFitSize={minFitSize}
        />
      ) : (
        <div className={cn("relative z-10 flex h-full min-h-0 w-full flex-col", alignClass)}>
          {scene.type === "countdown" ? (
            <p className="font-bold tabular-nums" style={{ fontSize: fontSize * 1.5 }}>
              {scene.content.body ?? "00:00"}
            </p>
          ) : scene.type === "song_lyrics" || scene.type === "announcement" ? (
            <ContentBlock
              scene={scene}
              theme={theme}
              opts={opts}
              body={body}
              compact={compact}
              alignClass={alignClass}
              emphasisClass={emphasisClass}
              textStyle={textStyle}
              legacyTextStyle={legacyTextStyle}
              maxFitSize={maxFitSize}
              minFitSize={minFitSize}
              showTitle={scene.type === "announcement"}
            />
          ) : (
            <ContentBlock
              scene={scene}
              theme={theme}
              opts={opts}
              body={body}
              compact={compact}
              alignClass={alignClass}
              emphasisClass={emphasisClass}
              textStyle={textStyle}
              legacyTextStyle={legacyTextStyle}
              maxFitSize={maxFitSize}
              minFitSize={minFitSize}
              verticalAlign={theme.verticalAlign}
            />
          )}
        </div>
      )}

      {!hideVectorLayers && (
        <VectorOverlay
          design={theme.vectorDesign}
          layer="foreground"
          className="absolute inset-0 z-[15] h-full w-full"
        />
      )}
    </div>
  );
}

function ComparisonLayout({
  scene,
  theme,
  opts,
  primaryBody,
  secondaryBody,
  primaryAbbr,
  secondaryAbbr,
  compact,
  alignClass,
  emphasisClass,
  textStyle,
  legacyTextStyle,
  maxFitSize,
  minFitSize,
}: {
  scene: Scene;
  theme: ThemeConfig;
  opts: DisplayOptions;
  primaryBody: string;
  secondaryBody: string;
  primaryAbbr?: string;
  secondaryAbbr?: string;
  compact?: boolean;
  alignClass: string;
  emphasisClass: string;
  textStyle: CSSProperties;
  legacyTextStyle: CSSProperties;
  maxFitSize: number;
  minFitSize: number;
}) {
  const primaryContent = renderBody(primaryBody, opts.highlightPhrase, opts.highlightColor);
  const secondaryContent = renderBody(secondaryBody, opts.highlightPhrase, opts.highlightColor);

  const dualVersionGap = compact ? "gap-4" : "gap-6 md:gap-8";
  const dualVersionDivider = compact
    ? "mt-1 border-t border-white/10 pt-3"
    : "mt-2 border-t border-white/15 pt-5 md:pt-6";

  const stackedVerses = opts.autoFit ? (
    <AutoFitText
      block
      blockClassName={dualVersionGap}
      enabled
      maxFontSize={maxFitSize}
      minFontSize={minFitSize}
      className={alignClass}
      style={textStyle}
      containerClassName="h-full min-h-0 w-full flex-1"
    >
      <p className={cn("m-0", emphasisClass, alignClass)}>{primaryContent}</p>
      <div className={dualVersionDivider}>
        <p className={cn("m-0 italic opacity-90", alignClass)}>{secondaryContent}</p>
      </div>
    </AutoFitText>
  ) : (
    <div className={cn("flex w-full flex-col", dualVersionGap, alignClass)} style={legacyTextStyle}>
      <p className={cn("m-0", scriptureTextClass, emphasisClass, alignClass)}>{primaryContent}</p>
      <div className={dualVersionDivider}>
        <p className={cn("m-0 italic opacity-90", scriptureTextClass, alignClass)}>{secondaryContent}</p>
      </div>
    </div>
  );

  const versionLabel =
    opts.showVersion && primaryAbbr && secondaryAbbr ? `${primaryAbbr} / ${secondaryAbbr}` : undefined;

  const headerRef =
    opts.showReference && theme.referencePosition === "header" && scene.content.reference ? (
      <ReferenceLine
        reference={scene.content.reference}
        abbr={versionLabel}
        theme={theme}
        compact={compact}
      />
    ) : null;

  const footerRef =
    opts.showReference && theme.referencePosition === "footer" && scene.content.reference ? (
      <ReferenceLine
        reference={scene.content.reference}
        abbr={versionLabel}
        theme={theme}
        compact={compact}
        prominent={!compact}
      />
    ) : null;

  return (
    <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
      <ScriptureFrame className="flex-1">
        <div className={cn("flex h-full min-h-0 w-full flex-col gap-1", alignClass)}>
          {headerRef}
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{stackedVerses}</div>
          {footerRef && (
            <div
              className={cn(
                "shrink-0 text-center",
                !compact && "border-t border-white/10 pt-4",
              )}
            >
              {footerRef}
            </div>
          )}
        </div>
      </ScriptureFrame>
    </div>
  );
}

function ContentBlock({
  scene,
  theme,
  opts,
  body,
  compact,
  alignClass,
  emphasisClass,
  textStyle,
  legacyTextStyle,
  maxFitSize,
  minFitSize,
  showTitle,
  verticalAlign = "center",
}: {
  scene: Scene;
  theme: ThemeConfig;
  opts: DisplayOptions;
  body: string;
  compact?: boolean;
  alignClass: string;
  emphasisClass: string;
  textStyle: CSSProperties;
  legacyTextStyle: CSSProperties;
  maxFitSize: number;
  minFitSize: number;
  showTitle?: boolean;
  verticalAlign?: ThemeConfig["verticalAlign"];
}) {
  const bodyContent = renderBody(body, opts.highlightPhrase, opts.highlightColor);
  const hasHeaderRef =
    opts.showReference && theme.referencePosition === "header" && !!scene.content.reference;
  const hasFooterRef =
    opts.showReference && theme.referencePosition === "footer" && !!scene.content.reference;

  const frameAlign =
    verticalAlign === "top" ? "start" : verticalAlign === "bottom" ? "end" : "center";

  const bodyNode = opts.autoFit ? (
    <AutoFitText
      enabled
      maxFontSize={maxFitSize}
      minFontSize={minFitSize}
      className={cn(emphasisClass, alignClass)}
      style={textStyle}
      containerClassName="h-full min-h-0 w-full flex-1"
    >
      {bodyContent}
    </AutoFitText>
  ) : (
    <p className={cn(scriptureTextClass, emphasisClass, alignClass)} style={legacyTextStyle}>
      {bodyContent}
    </p>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {showTitle && scene.content.title && (
        <p
          className={cn("mb-3 shrink-0 font-semibold", compact ? "text-[10px]" : "text-xl")}
          style={{ color: theme.accentColor }}
        >
          {scene.content.title}
        </p>
      )}
      <ScriptureFrame align={frameAlign} className="min-h-0 flex-1">
        <div className={cn("flex h-full min-h-0 w-full flex-col gap-1", alignClass)}>
          {hasHeaderRef && (
            <ReferenceLine
              reference={scene.content.reference!}
              abbr={opts.showVersion ? scene.content.translationAbbr : undefined}
              theme={theme}
              compact={compact}
            />
          )}
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{bodyNode}</div>
          {hasFooterRef && (
            <div
              className={cn(
                "shrink-0 text-center",
                !compact && "border-t border-white/10 pt-4",
              )}
            >
              <ReferenceLine
                reference={scene.content.reference!}
                abbr={opts.showVersion ? scene.content.translationAbbr : undefined}
                theme={theme}
                compact={compact}
                prominent={!compact}
              />
            </div>
          )}
        </div>
      </ScriptureFrame>
    </div>
  );
}

function LowerThirdLayout({
  scene,
  theme,
  opts,
  body,
  comparisonBody,
  comparisonAbbr,
  compact,
  compactVariant,
  emphasisClass,
  textStyle,
  maxFitSize,
  minFitSize,
}: {
  scene: Scene;
  theme: ThemeConfig;
  opts: DisplayOptions;
  body: string;
  comparisonBody?: string | null;
  comparisonAbbr?: string;
  compact?: boolean;
  compactVariant?: "panel" | "workspace" | "stage";
  emphasisClass: string;
  textStyle: CSSProperties;
  maxFitSize: number;
  minFitSize: number;
}) {
  const lt = theme.lowerThird;
  const scale = compact ? (compactVariant === "stage" ? 0.55 : 0.45) : 1;
  const barHeight = compact ? Math.max(lt.barHeight * scale, 14) : lt.barHeight;
  const refText = scene.content.reference
    ? formatReference(scene.content.reference, theme.referenceStyle)
    : undefined;
  const versionSuffix =
    opts.showVersion && scene.content.translationAbbr
      ? comparisonAbbr
        ? ` · ${scene.content.translationAbbr} / ${comparisonAbbr}`
        : ` · ${scene.content.translationAbbr}`
      : "";
  const bodyContent = renderBody(body, opts.highlightPhrase, opts.highlightColor);
  const secondaryContent = comparisonBody
    ? renderBody(comparisonBody, opts.highlightPhrase, opts.highlightColor)
    : null;
  const dual = !!secondaryContent;

  const hAlignClass =
    lt.horizontalAlign === "left"
      ? "items-start"
      : lt.horizontalAlign === "right"
        ? "items-end"
        : "items-center";

  const safeH = compact ? Math.min(lt.safeMarginPercent, 3) : lt.safeMarginPercent;
  const bottomPad = compact ? lt.bottomOffsetPercent * 0.6 : lt.bottomOffsetPercent;
  const widthPct = lt.widthPercent;

  const transparentOnOutput = lt.transparentOutput && !compact;
  const showBarFill = !transparentOnOutput && lt.barOpacity > 0.01;
  const barBackground = showBarFill ? applyBarColorOpacity(lt.barColor, lt.barOpacity) : "transparent";

  const outlineStyle: CSSProperties | undefined = lt.textOutline
    ? { textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }
    : theme.textShadow
      ? { textShadow: `0 2px 12px ${theme.shadowColor}` }
      : undefined;

  const textBlockStyle: CSSProperties = {
    ...textStyle,
    ...outlineStyle,
    WebkitLineClamp: lt.maxLines,
    display: lt.maxLines > 0 ? "-webkit-box" : undefined,
    WebkitBoxOrient: lt.maxLines > 0 ? "vertical" : undefined,
    overflow: lt.maxLines > 0 ? "hidden" : undefined,
  };

  const finalTextStyle =
    lt.template === "worship" ? worshipTextStyle(lt, theme.textColor, textBlockStyle) : textBlockStyle;

  const accentPx = compact ? Math.max(lt.accentWidth * 0.6, 2) : lt.accentWidth;
  const accentStyle: CSSProperties = { backgroundColor: theme.accentColor };

  const templateBarStyle: CSSProperties = {
    backgroundColor: barBackground,
    minHeight: dual ? barHeight * 1.55 : barHeight,
    paddingLeft: compact ? lt.paddingX * 0.45 : lt.paddingX,
    paddingRight: compact ? lt.paddingX * 0.45 : lt.paddingX,
    paddingTop: compact ? lt.paddingY * 0.5 : lt.paddingY,
    paddingBottom: compact ? lt.paddingY * 0.5 : lt.paddingY,
    backdropFilter: lt.backdropBlur && showBarFill ? "blur(12px)" : undefined,
    WebkitBackdropFilter: lt.backdropBlur && showBarFill ? "blur(12px)" : undefined,
  };

  if (lt.template === "line-only") {
    templateBarStyle.borderBottom = lt.showAccent
      ? `${accentPx}px solid ${theme.accentColor}`
      : "1px solid rgba(255,255,255,0.2)";
    templateBarStyle.backgroundColor = showBarFill ? barBackground : "transparent";
  } else if (lt.template === "glass") {
    templateBarStyle.border = "1px solid rgba(255,255,255,0.12)";
    templateBarStyle.borderRadius = compact ? 4 : 8;
  } else if (lt.template === "minimal") {
    templateBarStyle.borderRadius = compact ? 2 : 4;
  } else if (lt.template === "broadcast") {
    templateBarStyle.borderRadius = compact ? 2 : 6;
  }

  if (lt.showAccent && lt.template !== "line-only") {
    if (lt.accentPosition === "top") {
      templateBarStyle.borderTop = `${accentPx}px solid ${theme.accentColor}`;
    } else if (lt.accentPosition === "bottom") {
      templateBarStyle.borderBottom = `${accentPx}px solid ${theme.accentColor}`;
    }
  }

  const animationClass = !compact ? lowerThirdAnimationClass(lt.animation) : "";
  const contentAlign =
    lt.horizontalAlign === "left" ? "text-left" : lt.horizontalAlign === "right" ? "text-right" : "text-center";

  const referenceNode =
    refText && opts.showReference ? (
      lt.referencePlacement === "badge" ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded px-2 py-0.5 font-semibold uppercase tracking-wide",
            compact ? "text-[7px]" : "text-[10px]",
          )}
          style={{
            backgroundColor: theme.accentColor,
            color: "#fff",
          }}
        >
          {refText}
          {versionSuffix}
        </span>
      ) : (
        <p
          className={cn(
            "shrink-0 font-medium leading-tight",
            compact ? "text-[8px]" : "text-xs",
            lt.referencePlacement === "above" || lt.referencePlacement === "below" ? contentAlign : "",
          )}
          style={{ color: theme.referenceColor, fontSize: compact ? undefined : theme.referenceFontSize }}
        >
          {refText}
          {versionSuffix}
        </p>
      )
    ) : null;

  const bodyNode = opts.autoFit ? (
    <AutoFitText
      block={dual}
      blockClassName={dual && lt.dualStack === "horizontal" ? "gap-4 md:flex-row" : "gap-3"}
      enabled
      maxFontSize={maxFitSize}
      minFontSize={minFitSize}
      className={cn(emphasisClass, contentAlign)}
      style={finalTextStyle}
      containerClassName="h-full w-full min-h-0"
    >
      <p className={cn("m-0", emphasisClass, contentAlign)}>{bodyContent}</p>
      {dual && secondaryContent && (
        <div
          className={cn(
            lt.dualStack === "horizontal" ? "min-w-0 flex-1 border-l border-white/10 pl-4" : "border-t border-white/10 pt-3",
          )}
        >
          <p className={cn("m-0 italic opacity-90", contentAlign)}>{secondaryContent}</p>
        </div>
      )}
    </AutoFitText>
  ) : (
    <div className={cn("flex min-h-0 flex-col", dual && lt.dualStack === "horizontal" ? "flex-row gap-4" : "gap-3", contentAlign)}>
      <p
        className={cn(scriptureTextClass, emphasisClass, contentAlign, "m-0")}
        style={{ ...finalTextStyle, fontSize: compact ? Math.min(lt.textSize * scale, 14) : lt.textSize }}
      >
        {bodyContent}
      </p>
      {dual && secondaryContent && (
        <div className={cn(lt.dualStack === "horizontal" ? "border-l border-white/10 pl-4" : "border-t border-white/10 pt-3")}>
          <p
            className={cn(scriptureTextClass, "m-0 italic opacity-90", contentAlign)}
            style={{ ...finalTextStyle, fontSize: compact ? Math.min(lt.textSize * scale * 0.9, 13) : lt.textSize * 0.92 }}
          >
            {secondaryContent}
          </p>
        </div>
      )}
    </div>
  );

  const showInlineRef = referenceNode && lt.referencePlacement === "inline";
  const showAboveRef = referenceNode && lt.referencePlacement === "above";
  const showBelowRef = referenceNode && lt.referencePlacement === "below";
  const showBadgeRef = referenceNode && lt.referencePlacement === "badge";

  if (lt.template === "worship") {
    const worshipRefNode =
      refText && opts.showReference ? (
        <p
          className={cn("text-center font-semibold uppercase tracking-widest", compact ? "text-[8px]" : "text-sm")}
          style={{
            color: lt.accentGoldColor,
            textShadow: "0 1px 4px rgba(0,0,0,0.8)",
            fontFamily: lt.fontFamily || theme.fontFamily,
          }}
        >
          {refText}
          {versionSuffix}
        </p>
      ) : null;

    return (
      <div
        className="relative z-10 flex h-full flex-col justify-end items-center"
        style={{
          paddingBottom: `${bottomPad}%`,
          paddingLeft: `${safeH}%`,
          paddingRight: `${safeH}%`,
        }}
      >
        <div key={`${scene.id}-${scene.content.reference ?? ""}`} className="w-full min-w-0" style={{ width: `${widthPct}%`, maxWidth: "100%" }}>
          <WorshipLowerThirdBar
            lt={lt}
            compact={compact}
            compactVariant={compactVariant}
            animationClass={animationClass}
            transparentOnOutput={transparentOnOutput}
            referenceNode={worshipRefNode}
            referencePlacement={lt.referencePlacement}
          >
            <div className="w-full max-w-[920px] text-center">{bodyNode}</div>
          </WorshipLowerThirdBar>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative z-10 flex h-full flex-col justify-end", hAlignClass)}
      style={{
        paddingBottom: `${bottomPad}%`,
        paddingLeft: `${safeH}%`,
        paddingRight: `${safeH}%`,
      }}
    >
      <div
        key={`${scene.id}-${scene.content.reference ?? ""}`}
        className={cn(
          "flex w-full min-w-0",
          lt.template === "broadcast" && lt.showAccent && lt.accentPosition === "left" ? "flex-row" : "flex-col",
          animationClass,
          transparentOnOutput && compact && "outline outline-1 outline-dashed outline-emerald-500/40",
        )}
        style={{ width: `${widthPct}%`, maxWidth: "100%" }}
      >
        {lt.template === "broadcast" && lt.showAccent && lt.accentPosition === "left" && (
          <div className="shrink-0 self-stretch" style={{ ...accentStyle, width: accentPx * 2 }} />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {showAboveRef && <div className="mb-1.5">{referenceNode}</div>}

          <div
            className={cn(
              "flex min-w-0 flex-1 items-stretch gap-3",
              showInlineRef || showBadgeRef ? "flex-row" : "flex-col",
            )}
            style={templateBarStyle}
          >
            {showBadgeRef && <div className="flex shrink-0 items-center self-stretch">{referenceNode}</div>}

            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col justify-center",
                showInlineRef ? "flex-row items-center gap-4" : "",
              )}
              style={{
                minHeight: Math.max(barHeight - 4, 20),
                maxHeight: dual ? undefined : barHeight + lt.paddingY * 2,
              }}
            >
              <div className={cn("min-h-0 min-w-0 flex-1", showInlineRef ? "order-1" : "")}>{bodyNode}</div>
              {showInlineRef && <div className="order-2 shrink-0 self-center">{referenceNode}</div>}
            </div>
          </div>

          {showBelowRef && <div className="mt-1.5">{referenceNode}</div>}
        </div>
      </div>
    </div>
  );
}

function renderBody(body: string, phrase: string, highlightColor: string) {
  const parts = splitHighlight(body, phrase);
  if (!parts) return body;
  return (
    <>
      {parts.before}
      <mark style={highlightMarkStyle(highlightColor)}>{parts.match}</mark>
      {parts.after}
    </>
  );
}

function ReferenceLine({
  reference,
  theme,
  abbr,
  compact,
  prominent = false,
}: {
  reference: string;
  theme: ThemeConfig;
  abbr?: string;
  compact?: boolean;
  prominent?: boolean;
}) {
  const formatted = formatReference(reference, theme.referenceStyle);
  const projectionSize = Math.max(theme.referenceFontSize, 36);
  return (
    <p
      className={cn(
        "shrink-0 font-semibold leading-snug tracking-widest",
        theme.referenceStyle === "caps" ? "uppercase" : "",
        compact ? "text-[8px]" : prominent ? "text-2xl md:text-3xl" : "",
      )}
      style={{
        color: theme.referenceColor,
        fontSize: compact ? undefined : prominent ? projectionSize : theme.referenceFontSize,
        textShadow: theme.textShadow ? `0 2px 12px ${theme.shadowColor}` : undefined,
      }}
    >
      {formatted}
      {abbr ? ` · ${abbr}` : ""}
    </p>
  );
}
