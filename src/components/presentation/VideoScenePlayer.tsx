import { useEffect, useRef } from "react";
import { mediaUrl } from "@/lib/mediaUrl";
import { cn } from "@/lib/utils";
import { useVideoPlaybackStore } from "@/stores/videoPlaybackStore";

interface VideoScenePlayerProps {
  path: string;
  title?: string;
  className?: string;
  /**
   * - master: operator surface that owns time updates & binds the clip
   * - slave: output / secondary monitors that follow the store
   */
  role?: "master" | "slave";
  /** When true, this player is the live program feed (prefer unmuted). */
  isProgram?: boolean;
  autoPlay?: boolean;
  showTitle?: boolean;
  /** How the frame fills the output — cover fills the projection screen. */
  fit?: "cover" | "contain";
}

export function VideoScenePlayer({
  path,
  title,
  className,
  role = "master",
  isProgram = false,
  autoPlay = true,
  showTitle = true,
  fit = "cover",
}: VideoScenePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSeekToken = useRef(-1);

  const playing = useVideoPlaybackStore((s) => s.playing);
  const muted = useVideoPlaybackStore((s) => s.muted);
  const loop = useVideoPlaybackStore((s) => s.loop);
  const volume = useVideoPlaybackStore((s) => s.volume);
  const currentTime = useVideoPlaybackStore((s) => s.currentTime);
  const seekToken = useVideoPlaybackStore((s) => s.seekToken);
  const bind = useVideoPlaybackStore((s) => s.bind);
  const reportTime = useVideoPlaybackStore((s) => s.reportTime);
  const pause = useVideoPlaybackStore((s) => s.pause);

  const src = mediaUrl(path);

  useEffect(() => {
    if (role === "master") {
      bind(path, { autoPlay, loop });
    }
  }, [path, role, autoPlay, bind, loop]);

  // Apply play/pause
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      void el.play().catch(() => {
        // Autoplay with audio may fail on some surfaces — keep store honest.
        if (role === "master") pause();
      });
    } else {
      el.pause();
    }
  }, [playing, path, role, pause]);

  // Apply mute / loop / volume
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Operator monitors stay silent; program/output respects the mute toggle.
    el.muted = isProgram ? muted : true;
    el.loop = loop;
    el.volume = volume;
  }, [muted, loop, volume, isProgram]);

  // Apply seeks
  useEffect(() => {
    const el = videoRef.current;
    if (!el || seekToken === lastSeekToken.current) return;
    lastSeekToken.current = seekToken;
    if (Number.isFinite(currentTime)) {
      try {
        el.currentTime = currentTime;
      } catch {
        // Ignore until metadata ready
      }
    }
  }, [seekToken, currentTime]);

  return (
    <div className={cn("relative h-full overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        key={src}
        src={src}
        playsInline
        preload="auto"
        className={cn(
          "absolute inset-0 h-full w-full",
          fit === "contain" ? "object-contain" : "object-cover",
        )}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (role === "master") reportTime(el.currentTime, el.duration || 0);
          if (seekToken !== lastSeekToken.current && Number.isFinite(currentTime)) {
            try {
              el.currentTime = currentTime;
              lastSeekToken.current = seekToken;
            } catch {
              // ignore
            }
          }
        }}
        onTimeUpdate={(e) => {
          if (role !== "master") return;
          const el = e.currentTarget;
          reportTime(el.currentTime, el.duration || 0);
        }}
        onEnded={() => {
          if (role === "master" && !loop) pause();
        }}
      />
      {showTitle && title ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
          <p className="text-sm font-semibold text-white">{title}</p>
        </div>
      ) : null}
    </div>
  );
}
