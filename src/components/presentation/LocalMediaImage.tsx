import { useEffect, useState } from "react";
import { mediaUrl } from "@/lib/mediaUrl";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface LocalMediaImageProps {
  path: string | null | undefined;
  alt?: string;
  className?: string;
  /** Prefer asset protocol first; fall back to Rust data URL on error. */
  preferAsset?: boolean;
}

/**
 * Loads a local media library image into the webview.
 * Tries convertFileSrc first, then falls back to a Tauri data-URL read.
 */
export function LocalMediaImage({ path, alt = "", className, preferAsset = true }: LocalMediaImageProps) {
  const [src, setSrc] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    if (!path) {
      setSrc("");
      return;
    }

    const asset = mediaUrl(path);
    if (preferAsset && asset) {
      setSrc(asset);
      return;
    }

    void api
      .readMediaDataUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(asset);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, preferAsset]);

  if (!path || failed || !src) {
    return null;
  }

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      draggable={false}
      decoding="async"
      className={cn(className)}
      style={{ imageRendering: "auto" }}
      onError={() => {
        if (preferAsset && path && !src.startsWith("data:")) {
          void api
            .readMediaDataUrl(path)
            .then((url) => setSrc(url))
            .catch(() => setFailed(true));
          return;
        }
        setFailed(true);
      }}
    />
  );
}
