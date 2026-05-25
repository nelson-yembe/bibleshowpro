export interface SongSummary {
  id: string;
  title: string;
  artist?: string | null;
  default_key?: string | null;
  bpm?: number | null;
  tags_json: string;
  favorite: boolean;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  section_count: number;
}

export interface SongSection {
  id: string;
  song_id: string;
  section_type: string;
  label: string;
  lyrics: string;
  sort_order: number;
  lines_per_slide?: number | null;
}

export interface SongArrangement {
  id: string;
  song_id: string;
  name: string;
  section_order_json: string;
  is_default: boolean;
}

export interface LyricSlide {
  id: string;
  song_id: string;
  section_id?: string | null;
  section_label?: string | null;
  slide_order: number;
  text: string;
  display_notes?: string | null;
}

export interface SongCopyright {
  song_id: string;
  author?: string | null;
  composer?: string | null;
  publisher?: string | null;
  copyright_year?: string | null;
  ccli_number?: string | null;
  license_text?: string | null;
}

export interface SongDetail {
  id: string;
  title: string;
  artist?: string | null;
  default_key?: string | null;
  bpm?: number | null;
  tags_json: string;
  favorite: boolean;
  operator_notes?: string | null;
  theme_json: string;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  sections: SongSection[];
  arrangements: SongArrangement[];
  slides: LyricSlide[];
  copyright?: SongCopyright | null;
}

export interface SongThemeSettings {
  mode: "fullscreen" | "lower_third" | "confidence" | "clean";
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  backgroundType?: "solid" | "image" | "video" | "transparent";
  backgroundValue?: string;
  lowerThirdPosition?: "bottom" | "lower";
  showCopyrightFooter?: boolean;
  lineSpacing?: number;
  textShadow?: boolean;
}

export const SONG_TAG_FILTERS = [
  { id: "all", label: "All songs" },
  { id: "recent", label: "Recently used" },
  { id: "favorites", label: "Favorites" },
  { id: "tag:worship", label: "Worship" },
  { id: "tag:hymns", label: "Hymns" },
  { id: "tag:youth", label: "Youth" },
  { id: "tag:communion", label: "Communion" },
  { id: "tag:offering", label: "Offering" },
  { id: "tag:christmas", label: "Christmas" },
  { id: "tag:easter", label: "Easter" },
] as const;

export const SECTION_TYPES = [
  { value: "verse", label: "Verse" },
  { value: "chorus", label: "Chorus" },
  { value: "bridge", label: "Bridge" },
  { value: "tag", label: "Tag" },
  { value: "pre_chorus", label: "Pre-Chorus" },
  { value: "ending", label: "Ending" },
  { value: "instrumental", label: "Instrumental" },
  { value: "spoken", label: "Spoken" },
  { value: "intro", label: "Intro" },
] as const;

export function parseSongTags(tagsJson: string): string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function defaultSongTheme(): SongThemeSettings {
  return {
    mode: "fullscreen",
    fontSize: 48,
    backgroundType: "solid",
    lowerThirdPosition: "bottom",
    showCopyrightFooter: true,
    lineSpacing: 1.35,
    textShadow: true,
  };
}

export function parseSongTheme(themeJson: string): SongThemeSettings {
  try {
    return { ...defaultSongTheme(), ...(JSON.parse(themeJson) as SongThemeSettings) };
  } catch {
    return defaultSongTheme();
  }
}

export function copyrightLine(copyright?: SongCopyright | null): string {
  if (!copyright) return "";
  if (copyright.license_text) return copyright.license_text;
  const parts = [
    copyright.author,
    copyright.copyright_year ? `© ${copyright.copyright_year}` : null,
    copyright.publisher,
    copyright.ccli_number ? `CCLI ${copyright.ccli_number}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function splitLyricsToSlides(lyrics: string, linesPerSlide = 4): string[] {
  const lines = lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const slides: string[] = [];
  let chunk: string[] = [];
  for (const line of lines) {
    chunk.push(line);
    if (chunk.length >= linesPerSlide) {
      slides.push(chunk.join("\n"));
      chunk = [];
    }
  }
  if (chunk.length > 0) slides.push(chunk.join("\n"));
  return slides;
}

export function arrangementSectionIds(song: SongDetail): string[] {
  const arr = song.arrangements.find((a) => a.is_default);
  const parsed = arr ? (JSON.parse(arr.section_order_json) as string[]) : song.sections.map((s) => s.id);
  const valid = parsed.filter((id) => song.sections.some((s) => s.id === id));
  return valid.length > 0 ? valid : song.sections.map((s) => s.id);
}

export function sectionLinesPerSlide(section: SongSection, defaultLinesPerSlide = 4): number {
  const value = section.lines_per_slide ?? defaultLinesPerSlide;
  return Math.max(1, Math.min(12, value));
}

export function sectionSlideCount(section: SongSection, defaultLinesPerSlide = 4): number {
  if (!section.lyrics.trim()) return 0;
  return splitLyricsToSlides(section.lyrics, sectionLinesPerSlide(section, defaultLinesPerSlide)).length;
}

export function sectionLineCount(section: SongSection): number {
  return section.lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;
}

export function buildSlidesFromSong(song: SongDetail, defaultLinesPerSlide = 4): LyricSlide[] {
  const order = arrangementSectionIds(song);
  const slides: LyricSlide[] = [];
  let slideOrder = 0;

  for (const sectionId of order) {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const chunks = splitLyricsToSlides(
      section.lyrics,
      sectionLinesPerSlide(section, defaultLinesPerSlide),
    );
    for (const text of chunks) {
      slides.push({
        id: `${sectionId}-${slideOrder}`,
        song_id: song.id,
        section_id: sectionId,
        section_label: section.label,
        slide_order: slideOrder,
        text,
      });
      slideOrder += 1;
    }
  }

  return slides;
}

export interface SongSectionGroup {
  section: SongSection;
  slides: Array<LyricSlide & { globalIndex: number }>;
}

export function groupSlidesBySection(song: SongDetail, slides: LyricSlide[]): SongSectionGroup[] {
  const order = arrangementSectionIds(song);
  const groups: SongSectionGroup[] = [];

  for (const sectionId of order) {
    const section = song.sections.find((s) => s.id === sectionId);
    if (!section) continue;
    const sectionSlides = slides
      .map((slide, globalIndex) => ({ ...slide, globalIndex }))
      .filter((slide) => slide.section_id === sectionId);
    if (sectionSlides.length === 0 && !section.lyrics.trim()) continue;
    groups.push({ section, slides: sectionSlides });
  }

  return groups;
}
