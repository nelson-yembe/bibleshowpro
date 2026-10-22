/**
 * Words a speech engine should expect in a sermon. Gemini accepts a custom vocabulary;
 * without one it writes "Matthew 5:14" as "MasterChef 5 is eating".
 */

import { BIBLE_BOOKS } from "@/lib/bibleBooks";
import type { WhisperLanguage } from "@/lib/transcription/engineConfig";

/** French book names, as Louis Segond prints them. Numbered books share one entry. */
const FRENCH_BOOKS = [
  "Genèse", "Exode", "Lévitique", "Nombres", "Deutéronome", "Josué", "Juges", "Ruth", "Samuel", "Rois",
  "Chroniques", "Esdras", "Néhémie", "Esther", "Job", "Psaumes", "Proverbes", "Ecclésiaste",
  "Cantique des cantiques", "Ésaïe", "Jérémie", "Lamentations", "Ézéchiel", "Daniel", "Osée", "Joël", "Amos",
  "Abdias", "Jonas", "Michée", "Nahum", "Habacuc", "Sophonie", "Aggée", "Zacharie", "Malachie", "Matthieu",
  "Marc", "Luc", "Jean", "Actes", "Romains", "Corinthiens", "Galates", "Éphésiens", "Philippiens",
  "Colossiens", "Thessaloniciens", "Timothée", "Tite", "Philémon", "Hébreux", "Jacques", "Pierre", "Jude",
  "Apocalypse",
];

/** "1 Corinthians" and "2 Corinthians" are one word to listen for. */
function englishBooks(): string[] {
  return [...new Set(BIBLE_BOOKS.map((book) => book.name.replace(/^[1-3]\s+/, "")))];
}

/**
 * Book names plus the words that frame a reference. Gemini does best with up to about
 * a hundred terms, which one language fits; both together stay well under its limit.
 */
export function scriptureVocabulary(language: WhisperLanguage): string[] {
  const english = [...englishBooks(), "Psalm", "chapter", "verse"];
  const french = [...FRENCH_BOOKS, "chapitre", "verset"];
  if (language === "fr") return french;
  if (language === "auto") return [...new Set([...english, ...french])];
  return english;
}
