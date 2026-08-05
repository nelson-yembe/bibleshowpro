import type { ServiceItem } from "@/lib/tauri";
import { parseServiceItemContent } from "@/lib/serviceItemContent";

/** Item types that are run-sheet structure only — never sent to program. */
export const NON_PRESENTABLE_TYPES = new Set(["section"]);

export const SERVICE_ITEM_COLORS: Record<string, string> = {
  countdown: "bg-orange-500",
  song: "bg-purple-500",
  scripture: "bg-sky-500",
  announcement: "bg-blue-500",
  sermon_note: "bg-emerald-500",
  video: "bg-red-500",
  image: "bg-amber-500",
  logo: "bg-slate-500",
  blackout: "bg-gray-700",
  blank: "bg-gray-600",
  section: "bg-transparent",
  speaker_lower_third: "bg-pink-500",
};

export function isPresentableServiceItem(item: Pick<ServiceItem, "item_type">): boolean {
  return !NON_PRESENTABLE_TYPES.has(item.item_type);
}

export function formatItemType(type: string): string {
  return type.replace(/_/g, " ");
}

export function itemDurationLabel(item: ServiceItem): string | null {
  const content = parseServiceItemContent(item.content_json);
  if (item.item_type === "countdown" && content.countdownSeconds) {
    const mins = Math.round(content.countdownSeconds / 60);
    return mins > 0 ? `${mins}m` : `${content.countdownSeconds}s`;
  }
  const mins = (content as { durationMinutes?: number }).durationMinutes;
  return typeof mins === "number" && mins > 0 ? `${mins}m` : null;
}

export function deepLinkForItem(item: ServiceItem): { to: string; label: string } | null {
  const content = parseServiceItemContent(item.content_json);
  switch (item.item_type) {
    case "scripture":
      return { to: "/bible", label: "Open in Bible Search" };
    case "song":
      return content.songId
        ? { to: "/songs", label: "Open in Songs" }
        : { to: "/songs", label: "Pick song in Songs" };
    case "video":
    case "image":
      return { to: "/media", label: "Open in Media" };
    default:
      return null;
  }
}

/** Find next/prev presentable item index from a starting index (exclusive of start when stepping). */
export function neighborPresentableIndex(
  items: ServiceItem[],
  fromIndex: number,
  direction: 1 | -1,
): number {
  if (items.length === 0) return -1;
  let i = fromIndex;
  if (i < 0) {
    // No selection: first presentable for next, last for prev
    if (direction === 1) {
      return items.findIndex((item) => isPresentableServiceItem(item));
    }
    for (let j = items.length - 1; j >= 0; j--) {
      if (isPresentableServiceItem(items[j]!)) return j;
    }
    return -1;
  }
  i += direction;
  while (i >= 0 && i < items.length) {
    if (isPresentableServiceItem(items[i]!)) return i;
    i += direction;
  }
  return -1;
}
