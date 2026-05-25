import { cn } from "@/lib/utils";

interface SafeMarginOverlayProps {
  marginPercent: number;
  className?: string;
}

/** Title-safe / action-safe guides for 16:9 staging preview. */
export function SafeMarginOverlay({ marginPercent, className }: SafeMarginOverlayProps) {
  if (marginPercent <= 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-20", className)} aria-hidden>
      <div
        className="absolute border border-dashed border-amber-400/50"
        style={{
          top: `${marginPercent}%`,
          right: `${marginPercent}%`,
          bottom: `${marginPercent}%`,
          left: `${marginPercent}%`,
        }}
      />
      <span className="absolute left-[calc(var(--margin)+4px)] top-[calc(var(--margin)+4px)] rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-amber-400/90"
        style={{ ["--margin" as string]: `${marginPercent}%` }}
      >
        Title safe {marginPercent}%
      </span>
    </div>
  );
}

interface ChromaPreviewGridProps {
  className?: string;
}

/** Checkerboard behind transparent lower thirds in staging preview. */
export function ChromaPreviewGrid({ className }: ChromaPreviewGridProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 z-[5]", className)}
      style={{
        backgroundImage:
          "linear-gradient(45deg, #14532d 25%, transparent 25%), linear-gradient(-45deg, #14532d 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #14532d 75%), linear-gradient(-45deg, transparent 75%, #14532d 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
        backgroundColor: "#166534",
        opacity: 0.35,
      }}
      aria-hidden
    />
  );
}
