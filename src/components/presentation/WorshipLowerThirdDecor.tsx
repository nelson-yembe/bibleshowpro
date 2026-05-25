import { cn } from "@/lib/utils";

interface WorshipGoldBorderProps {
  position: "top" | "bottom";
  thickness: number;
  gold: string;
}

export function WorshipGoldBorder({ position, thickness, gold }: WorshipGoldBorderProps) {
  return (
    <div
      className={cn("absolute inset-x-0 z-[3]", position === "top" ? "top-0" : "bottom-0")}
      style={{
        height: thickness,
        background: `linear-gradient(180deg, ${position === "top" ? "#fff8dc 0%, " + gold + " 35%, #b8860b 70%, #8b6914 100%" : "#8b6914 0%, #b8860b 30%, " + gold + " 65%, #fff8dc 100%"})`,
        boxShadow:
          position === "top"
            ? `0 2px 8px rgba(229, 199, 107, 0.55), inset 0 1px 0 rgba(255,255,255,0.45)`
            : `0 -2px 8px rgba(229, 199, 107, 0.45), inset 0 -1px 0 rgba(255,255,255,0.35)`,
      }}
      aria-hidden
    />
  );
}
