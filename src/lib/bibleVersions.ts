import type { CatalogEntryView } from "@/lib/tauri";

/** A catalog download smaller than this is a failed or partial download, not a Bible. */
export const MIN_DOWNLOADED_VERSES = 1000;
/** About the size of a whole Bible; less than this is labelled partial. */
export const FULL_BIBLE_VERSES = 30_000;

/**
 * Whether a version can be picked: a downloaded catalog Bible once it is really there, and
 * any translation imported from a file, which is as complete as the file was (a New
 * Testament, or a translation still being made, counts).
 */
export function isUsableVersion(entry: Pick<CatalogEntryView, "installed" | "verse_count" | "install_method">): boolean {
  if (!entry.installed) return false;
  return entry.install_method === "imported" ? entry.verse_count > 0 : entry.verse_count > MIN_DOWNLOADED_VERSES;
}
