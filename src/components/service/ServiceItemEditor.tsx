import { useEffect, useState } from "react";
import { Music, Image, Video } from "lucide-react";
import type { ServiceItem } from "@/lib/tauri";
import { api } from "@/lib/tauri";
import {
  parseServiceItemContent,
  stringifyServiceItemContent,
  type ServiceItemContent,
} from "@/lib/serviceItemContent";
import { useServiceStore } from "@/stores/serviceStore";

interface ServiceItemEditorProps {
  item: ServiceItem;
  onPickSong: () => void;
  onPickMedia: (type: "video" | "image") => void;
}

export function ServiceItemEditor({ item, onPickSong, onPickMedia }: ServiceItemEditorProps) {
  const updateItem = useServiceStore((s) => s.updateItem);
  const [content, setContent] = useState<ServiceItemContent>(() => parseServiceItemContent(item.content_json));
  const [linkedSongTitle, setLinkedSongTitle] = useState<string | null>(null);
  const [linkedMediaName, setLinkedMediaName] = useState<string | null>(null);

  useEffect(() => {
    setContent(parseServiceItemContent(item.content_json));
  }, [item.id, item.content_json]);

  useEffect(() => {
    if (item.item_type !== "song" || !content.songId) {
      setLinkedSongTitle(null);
      return;
    }
    void api.getSong(content.songId).then(
      (song) => setLinkedSongTitle(song.title),
      () => setLinkedSongTitle(null),
    );
  }, [item.item_type, content.songId]);

  useEffect(() => {
    const mediaId = content.mediaId;
    if ((item.item_type !== "video" && item.item_type !== "image") || !mediaId) {
      setLinkedMediaName(null);
      return;
    }
    void api.listMedia().then((items) => {
      const match = items.find((entry) => entry.id === mediaId);
      setLinkedMediaName(match?.name ?? null);
    });
  }, [item.item_type, content.mediaId]);

  const saveContent = (next: ServiceItemContent, title?: string) => {
    setContent(next);
    void updateItem(item.id, {
      contentJson: stringifyServiceItemContent(next),
      ...(title !== undefined ? { title } : {}),
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Title">
        <input
          key={item.id}
          defaultValue={item.title}
          onBlur={(e) => {
            if (e.target.value !== item.title) {
              void updateItem(item.id, { title: e.target.value });
            }
          }}
          className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
        />
      </Field>

      {item.item_type === "scripture" && (
        <Field label="Reference">
          <input
            value={content.reference ?? item.title}
            onChange={(e) => setContent({ ...content, reference: e.target.value })}
            onBlur={(e) => saveContent({ ...content, reference: e.target.value }, e.target.value)}
            className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            placeholder="Romans 8:28-30"
          />
        </Field>
      )}

      {item.item_type === "song" && (
        <Field label="Linked song">
          <div className="flex gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs">
              <Music className="h-3.5 w-3.5 shrink-0 text-purple-400" />
              <span className="truncate">{linkedSongTitle ?? (content.songId ? "Loading…" : "No song linked")}</span>
            </div>
            <button
              type="button"
              onClick={onPickSong}
              className="shrink-0 rounded-md border border-[var(--color-border-light)] px-2 text-[11px] hover:bg-[var(--color-panel-hover)]"
            >
              {content.songId ? "Change" : "Pick"}
            </button>
          </div>
        </Field>
      )}

      {(item.item_type === "video" || item.item_type === "image") && (
        <Field label={`Linked ${item.item_type}`}>
          <div className="flex gap-2">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs">
              {item.item_type === "video" ? (
                <Video className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <Image className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              )}
              <span className="truncate">
                {linkedMediaName ?? (content.mediaId ? "Loading…" : `No ${item.item_type} linked`)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onPickMedia(item.item_type as "video" | "image")}
              className="shrink-0 rounded-md border border-[var(--color-border-light)] px-2 text-[11px] hover:bg-[var(--color-panel-hover)]"
            >
              {content.mediaId ? "Change" : "Pick"}
            </button>
          </div>
        </Field>
      )}

      {item.item_type === "countdown" && (
        <Field label="Duration (seconds)">
          <input
            type="number"
            min={1}
            value={content.countdownSeconds ?? 300}
            onChange={(e) => setContent({ ...content, countdownSeconds: Number(e.target.value) || 300 })}
            onBlur={() => saveContent(content)}
            className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
          />
        </Field>
      )}

      {(item.item_type === "announcement" || item.item_type === "sermon_note" || item.item_type === "logo") && (
        <Field label="Body text">
          <textarea
            value={content.body ?? ""}
            onChange={(e) => setContent({ ...content, body: e.target.value })}
            onBlur={() => saveContent(content)}
            rows={2}
            className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
          />
        </Field>
      )}

      {item.item_type === "speaker_lower_third" && (
        <>
          <Field label="Speaker name">
            <input
              value={content.speakerName ?? ""}
              onChange={(e) => setContent({ ...content, speakerName: e.target.value })}
              onBlur={() => saveContent(content, content.speakerName || item.title)}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            />
          </Field>
          <Field label="Speaker title">
            <input
              value={content.speakerTitle ?? ""}
              onChange={(e) => setContent({ ...content, speakerTitle: e.target.value })}
              onBlur={() => saveContent(content)}
              className="h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 text-xs"
            />
          </Field>
        </>
      )}

      <Field label="Operator note">
        <textarea
          key={`${item.id}-notes`}
          defaultValue={item.operator_notes ?? ""}
          onBlur={(e) => {
            const value = e.target.value;
            if (value !== (item.operator_notes ?? "")) {
              void updateItem(item.id, { operatorNotes: value });
            }
          }}
          rows={2}
          className="w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
          placeholder="Notes visible to operator only..."
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-label mb-1.5">{label}</p>
      {children}
    </div>
  );
}
