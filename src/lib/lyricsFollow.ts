/** Lyric matching for following the worship leader; the same word rules as `songs/heard.rs`. */

export function lyricWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Share of `line` heard, in order, somewhere in `heard` (longest common subsequence). */
export function coverage(heard: string[], line: string[]): number {
  if (line.length === 0) return 0;
  const row = new Array<number>(line.length + 1).fill(0);
  for (const word of heard) {
    let diagonal = 0;
    for (let j = 0; j < line.length; j += 1) {
      const above = row[j + 1];
      row[j + 1] = word === line[j] ? diagonal + 1 : Math.max(row[j + 1], row[j]);
      diagonal = above;
    }
  }
  return row[line.length] / line.length;
}

/** Enough of a line to recognise once sung. */
export const FOLLOW_MATCH = 0.6;
/** How many recent words are compared: about one sung line and a half. */
export const HEARD_WINDOW = 14;

function lines(text: string): string[][] {
  return text
    .split("\n")
    .map(lyricWords)
    .filter((line) => line.length > 0);
}

/** The opening of a slide: its first line, or two when the first is too short to be telling. */
export function openingOf(text: string): string[] {
  const [first = [], second = []] = lines(text);
  return first.length >= 3 ? first : [...first, ...second];
}

export function closingOf(text: string): string[] {
  const all = lines(text);
  return all[all.length - 1] ?? [];
}

/**
 * Move to the next slide once its opening line is being sung. When the next slide opens
 * like the one on screen (a repeated chorus), wait until the end of this one was heard,
 * or the first words of the chorus would skip it.
 */
export function shouldAdvance(args: {
  heard: string[];
  current: string;
  next: string | null;
  closingHeard: boolean;
}): boolean {
  if (!args.next) return false;
  const opening = openingOf(args.next);
  if (opening.length < 3 || coverage(args.heard, opening) < FOLLOW_MATCH) return false;
  const opensLikeCurrent = coverage(openingOf(args.current), opening) >= 0.8;
  return !opensLikeCurrent || args.closingHeard;
}
