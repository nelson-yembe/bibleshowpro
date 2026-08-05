import { memo } from "react";
import { usePresentationStore } from "@/stores/presentationStore";

/** Subscribes only to live/program state — isolated from bible staging re-renders. */
export const BibleLiveAirBadge = memo(function BibleLiveAirBadge() {
  const liveFollow = usePresentationStore((s) => s.liveFollow);
  const programType = usePresentationStore((s) => s.program?.type);

  if (!liveFollow || !programType || programType === "blackout") return null;

  return <span className="live-badge">● ● ON AIR</span>;
});
