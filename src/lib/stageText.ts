import type { Scene } from "@/engine/scene";

/** What a stage display shows for one scene: a heading to find your place, and the words. */
export interface StageText {
  kind: "verse" | "lyrics" | "text" | "media" | "countdown" | "screen";
  heading: string;
  body: string;
}

function versesText(scene: Scene): string {
  const verses = scene.content.verses ?? [];
  if (verses.length === 0) return scene.content.body ?? "";
  if (verses.length === 1) return verses[0].text;
  // Several verses: number them so the reader can follow along with the preacher.
  return verses.map((v) => `${v.verse} ${v.text}`).join(" ");
}

function referenceHeading(scene: Scene): string {
  const reference = scene.content.reference ?? scene.content.title ?? "Scripture";
  const abbr = scene.content.translationAbbr;
  return abbr ? `${reference} (${abbr})` : reference;
}

/**
 * The stage display reads scenes as words, not pictures: the preacher needs to know what
 * the congregation is reading, not see a second copy of the theme.
 */
export function stageTextOf(scene: Scene | null): StageText | null {
  if (!scene) return null;
  const c = scene.content;
  switch (scene.type) {
    case "scripture_fullscreen":
    case "scripture_lower_third":
      return { kind: "verse", heading: referenceHeading(scene), body: versesText(scene) };
    case "scripture_comparison":
      return {
        kind: "verse",
        heading: referenceHeading(scene),
        body: [versesText(scene), c.comparisonBody ?? c.comparisonVerse?.text ?? ""].filter(Boolean).join("\n\n"),
      };
    case "song_lyrics":
      return { kind: "lyrics", heading: c.title ?? "Song", body: c.body ?? "" };
    case "announcement":
      return { kind: "text", heading: c.title ?? "Announcement", body: c.body ?? "" };
    case "speaker_lower_third":
      return { kind: "text", heading: c.speakerName ?? "Speaker", body: c.speakerTitle ?? "" };
    case "countdown":
      return { kind: "countdown", heading: c.title ?? "Countdown", body: "" };
    case "image":
      return { kind: "media", heading: c.title ?? "Image on screen", body: "" };
    case "video":
      return { kind: "media", heading: c.title ?? "Video playing", body: "" };
    case "blackout":
      return { kind: "screen", heading: "Screen is black", body: "" };
    case "blank":
      return { kind: "screen", heading: "Screen is clear", body: "" };
    case "logo":
      return { kind: "screen", heading: "Logo on screen", body: "" };
  }
}

/** Long passages step down in size so a whole verse still fits the stage screen. */
export function stageBodySize(body: string): "large" | "medium" | "small" {
  if (body.length > 420) return "small";
  if (body.length > 220) return "medium";
  return "large";
}
