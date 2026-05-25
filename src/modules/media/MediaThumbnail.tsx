import { AlertTriangle, Film, Image as ImageIcon, Music } from "lucide-react";
import type { MediaRecord } from "@/lib/tauri";
import { mediaUrl } from "@/lib/mediaUrl";
import { cn } from "@/lib/utils";

interface MediaThumbnailProps {
  item: MediaRecord;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function MediaThumbnail({ item, selected, compact, onClick, onDoubleClick }: MediaThumbnailProps) {
  const previewPath = item.thumbnail_path ?? (item.media_type === "image" ? item.file_path : null);
  const src = previewPath ? mediaUrl(previewPath) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group overflow-hidden rounded-lg border text-left transition-colors",
        selected
          ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]"
          : "border-[var(--color-border-light)] hover:border-[var(--color-border)]",
      )}
    >
      <div className={cn("relative bg-gradient-to-br from-slate-900 to-black", compact ? "aspect-video" : "aspect-video")}>
        {src && item.file_exists ? (
          <img src={src} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center">
            {item.media_type === "video" ? (
              <Film className="h-8 w-8 text-white/30" />
            ) : item.media_type === "audio" ? (
              <Music className="h-8 w-8 text-white/30" />
            ) : (
              <ImageIcon className="h-8 w-8 text-white/30" />
            )}
          </div>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white/80">
          {item.media_type}
        </div>

        {!item.file_exists && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-amber-950/90 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
            <AlertTriangle className="h-2.5 w-2.5" />
            Missing
          </div>
        )}

        {selected && (
          <div className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white">
            ✓
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium">{item.name}</p>
        {!compact && (
          <p className="truncate text-[10px] text-[var(--color-subtle)]">
            {new Date(item.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </button>
  );
}

interface MediaPreviewProps {
  item: MediaRecord;
  className?: string;
}

export function MediaPreview({ item, className }: MediaPreviewProps) {
  const src = mediaUrl(item.file_path);

  if (!item.file_exists) {
    return (
      <div className={cn("flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-amber-950/20 p-4 text-center", className)}>
        <AlertTriangle className="h-8 w-8 text-amber-400" />
        <p className="text-xs text-amber-200">File missing on disk</p>
        <p className="text-[10px] text-[var(--color-subtle)]">{item.file_path}</p>
      </div>
    );
  }

  if (item.media_type === "video") {
    return (
      <video
        key={item.id}
        src={src}
        controls
        autoPlay
        loop
        muted
        playsInline
        className={cn("aspect-video w-full rounded-lg bg-black object-contain", className)}
      />
    );
  }

  if (item.media_type === "audio") {
    return (
      <div className={cn("flex aspect-video flex-col items-center justify-center gap-4 rounded-lg bg-[var(--color-panel)] p-6", className)}>
        <Music className="h-12 w-12 text-[var(--color-primary)]" />
        <p className="text-sm font-medium">{item.name}</p>
        <audio key={item.id} src={src} controls className="w-full" />
      </div>
    );
  }

  return (
    <img
      key={item.id}
      src={src}
      alt={item.name}
      className={cn("aspect-video w-full rounded-lg bg-black object-contain", className)}
    />
  );
}
