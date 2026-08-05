import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { LocalMediaImage } from "@/components/presentation/LocalMediaImage";
import { mediaUrl } from "@/lib/mediaUrl";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface VideoPosterThumbProps {
  mediaId: string;
  videoPath: string;
  thumbnailPath?: string | null;
  alt?: string;
  className?: string;
  /** Called when a poster is generated/saved so the parent can refresh the record. */
  onThumbnailReady?: (thumbnailPath: string) => void;
}

/**
 * Shows a video poster like image thumbnails.
 * Prefers a saved thumbnail_path; otherwise captures a frame in-browser and persists it.
 */
export function VideoPosterThumb({
  mediaId,
  videoPath,
  thumbnailPath,
  alt = "",
  className,
  onThumbnailReady,
}: VideoPosterThumbProps) {
  const [posterSrc, setPosterSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const capturing = useRef(false);
  const onReadyRef = useRef(onThumbnailReady);
  onReadyRef.current = onThumbnailReady;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setPosterSrc(null);

    if (thumbnailPath) {
      return;
    }

    if (capturing.current) return;
    capturing.current = true;

    const capture = async () => {
      try {
        // Prefer ffmpeg-backed generation on the Rust side.
        try {
          const updated = await api.ensureVideoThumbnail(mediaId);
          if (cancelled) return;
          if (updated.thumbnail_path) {
            onReadyRef.current?.(updated.thumbnail_path);
            return;
          }
        } catch {
          // Fall through to in-browser capture.
        }

        const frame = await captureVideoFrame(videoPath);
        if (cancelled || !frame) {
          if (!cancelled) setFailed(true);
          return;
        }
        setPosterSrc(frame);
        try {
          const saved = await api.saveMediaThumbnailJpeg(mediaId, frame);
          if (!cancelled && saved.thumbnail_path) {
            onReadyRef.current?.(saved.thumbnail_path);
          }
        } catch {
          // Showing the in-memory frame is still useful.
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        capturing.current = false;
      }
    };

    void capture();
    return () => {
      cancelled = true;
      capturing.current = false;
    };
  }, [mediaId, videoPath, thumbnailPath]);

  if (thumbnailPath) {
    return <LocalMediaImage path={thumbnailPath} alt={alt} className={className} />;
  }

  if (posterSrc && !failed) {
    return <img src={posterSrc} alt={alt} className={cn(className)} />;
  }

  return (
    <div className={cn("flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-black", className)}>
      <Film className="h-8 w-8 text-white/30" />
    </div>
  );
}

function captureVideoFrame(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = mediaUrl(path);

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };

    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.onerror = fail;
    video.onloadeddata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const seekTo = duration > 2 ? Math.min(1, duration * 0.1) : 0.05;
      const onSeeked = () => {
        try {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 360;
          const canvas = document.createElement("canvas");
          const maxW = 640;
          const scale = Math.min(1, maxW / w);
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            fail();
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          cleanup();
          resolve(dataUrl);
        } catch {
          fail();
        }
      };
      video.onseeked = onSeeked;
      try {
        video.currentTime = seekTo;
      } catch {
        onSeeked();
      }
    };
  });
}
