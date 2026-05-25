import verseCountsByBook from "@/lib/data/verses-per-chapter.json";

export interface BibleBook {
  name: string;
  number: number;
  chapters: number;
  testament: "OT" | "NT";
}

type VerseCountsByBook = Record<string, number[]>;

const VERSES_PER_CHAPTER = verseCountsByBook as VerseCountsByBook;

export const BIBLE_BOOKS: BibleBook[] = [
  { number: 1, name: "Genesis", chapters: 50, testament: "OT" },
  { number: 2, name: "Exodus", chapters: 40, testament: "OT" },
  { number: 3, name: "Leviticus", chapters: 27, testament: "OT" },
  { number: 4, name: "Numbers", chapters: 36, testament: "OT" },
  { number: 5, name: "Deuteronomy", chapters: 34, testament: "OT" },
  { number: 6, name: "Joshua", chapters: 24, testament: "OT" },
  { number: 7, name: "Judges", chapters: 21, testament: "OT" },
  { number: 8, name: "Ruth", chapters: 4, testament: "OT" },
  { number: 9, name: "1 Samuel", chapters: 31, testament: "OT" },
  { number: 10, name: "2 Samuel", chapters: 24, testament: "OT" },
  { number: 11, name: "1 Kings", chapters: 22, testament: "OT" },
  { number: 12, name: "2 Kings", chapters: 25, testament: "OT" },
  { number: 13, name: "1 Chronicles", chapters: 29, testament: "OT" },
  { number: 14, name: "2 Chronicles", chapters: 36, testament: "OT" },
  { number: 15, name: "Ezra", chapters: 10, testament: "OT" },
  { number: 16, name: "Nehemiah", chapters: 13, testament: "OT" },
  { number: 17, name: "Esther", chapters: 10, testament: "OT" },
  { number: 18, name: "Job", chapters: 42, testament: "OT" },
  { number: 19, name: "Psalms", chapters: 150, testament: "OT" },
  { number: 20, name: "Proverbs", chapters: 31, testament: "OT" },
  { number: 21, name: "Ecclesiastes", chapters: 12, testament: "OT" },
  { number: 22, name: "Song of Solomon", chapters: 8, testament: "OT" },
  { number: 23, name: "Isaiah", chapters: 66, testament: "OT" },
  { number: 24, name: "Jeremiah", chapters: 52, testament: "OT" },
  { number: 25, name: "Lamentations", chapters: 5, testament: "OT" },
  { number: 26, name: "Ezekiel", chapters: 48, testament: "OT" },
  { number: 27, name: "Daniel", chapters: 12, testament: "OT" },
  { number: 28, name: "Hosea", chapters: 14, testament: "OT" },
  { number: 29, name: "Joel", chapters: 3, testament: "OT" },
  { number: 30, name: "Amos", chapters: 9, testament: "OT" },
  { number: 31, name: "Obadiah", chapters: 1, testament: "OT" },
  { number: 32, name: "Jonah", chapters: 4, testament: "OT" },
  { number: 33, name: "Micah", chapters: 7, testament: "OT" },
  { number: 34, name: "Nahum", chapters: 3, testament: "OT" },
  { number: 35, name: "Habakkuk", chapters: 3, testament: "OT" },
  { number: 36, name: "Zephaniah", chapters: 3, testament: "OT" },
  { number: 37, name: "Haggai", chapters: 2, testament: "OT" },
  { number: 38, name: "Zechariah", chapters: 14, testament: "OT" },
  { number: 39, name: "Malachi", chapters: 4, testament: "OT" },
  { number: 40, name: "Matthew", chapters: 28, testament: "NT" },
  { number: 41, name: "Mark", chapters: 16, testament: "NT" },
  { number: 42, name: "Luke", chapters: 24, testament: "NT" },
  { number: 43, name: "John", chapters: 21, testament: "NT" },
  { number: 44, name: "Acts", chapters: 28, testament: "NT" },
  { number: 45, name: "Romans", chapters: 16, testament: "NT" },
  { number: 46, name: "1 Corinthians", chapters: 16, testament: "NT" },
  { number: 47, name: "2 Corinthians", chapters: 13, testament: "NT" },
  { number: 48, name: "Galatians", chapters: 6, testament: "NT" },
  { number: 49, name: "Ephesians", chapters: 6, testament: "NT" },
  { number: 50, name: "Philippians", chapters: 4, testament: "NT" },
  { number: 51, name: "Colossians", chapters: 4, testament: "NT" },
  { number: 52, name: "1 Thessalonians", chapters: 5, testament: "NT" },
  { number: 53, name: "2 Thessalonians", chapters: 3, testament: "NT" },
  { number: 54, name: "1 Timothy", chapters: 6, testament: "NT" },
  { number: 55, name: "2 Timothy", chapters: 4, testament: "NT" },
  { number: 56, name: "Titus", chapters: 3, testament: "NT" },
  { number: 57, name: "Philemon", chapters: 1, testament: "NT" },
  { number: 58, name: "Hebrews", chapters: 13, testament: "NT" },
  { number: 59, name: "James", chapters: 5, testament: "NT" },
  { number: 60, name: "1 Peter", chapters: 5, testament: "NT" },
  { number: 61, name: "2 Peter", chapters: 3, testament: "NT" },
  { number: 62, name: "1 John", chapters: 5, testament: "NT" },
  { number: 63, name: "2 John", chapters: 1, testament: "NT" },
  { number: 64, name: "3 John", chapters: 1, testament: "NT" },
  { number: 65, name: "Jude", chapters: 1, testament: "NT" },
  { number: 66, name: "Revelation", chapters: 22, testament: "NT" },
];

export function getBookByName(name: string) {
  return BIBLE_BOOKS.find((b) => b.name === name);
}

export function getBookVerseCounts(bookName: string): number[] | undefined {
  const book = getBookByName(bookName);
  if (!book) return undefined;
  return VERSES_PER_CHAPTER[String(book.number)];
}

export function chapterCountForBook(bookName: string) {
  return getBookVerseCounts(bookName)?.length ?? getBookByName(bookName)?.chapters ?? 1;
}

export function verseCountForChapter(bookName: string, chapter: number | string) {
  const counts = getBookVerseCounts(bookName);
  const ch = Number(chapter);
  if (!counts || !Number.isFinite(ch) || ch < 1 || ch > counts.length) return 1;
  return counts[ch - 1] ?? 1;
}

export function chapterOptions(bookName: string) {
  const count = chapterCountForBook(bookName);
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

export function verseOptions(bookName: string, chapter: number | string) {
  const count = verseCountForChapter(bookName, chapter);
  return Array.from({ length: count }, (_, i) => String(i + 1));
}
