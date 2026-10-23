//! Which verse of the passage being preached was just read or paraphrased, whatever
//! translation the preacher reads from.
//!
//! Searching one chapter, not the whole Bible, is what makes matching on a few words
//! reliable: "God so loved the world that he gave his only Son" can only be one verse of
//! John 3. Every installed translation is compared, and King James forms are folded into
//! modern ones, so a preacher reading the NIV still finds the KJV verse on screen.

use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReadingMatch {
    pub verse: i32,
    pub score: f32,
    /// The translation whose wording matched best.
    pub translation_id: String,
}

/// Content words shared, in order, before a verse counts as read. Three is enough inside one
/// chapter ("shepherd … lack nothing"); across the whole Bible it would not be.
const MIN_SHARED: usize = 3;
pub const READING_MATCH: f32 = 0.6;

const STOP_WORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "did", "do", "for", "from", "had", "has", "have",
    "he", "her", "him", "his", "i", "in", "is", "it", "its", "me", "my", "not", "of", "on", "or", "our", "she",
    "so", "that", "the", "their", "them", "then", "there", "they", "this", "to", "upon", "us", "was", "we",
    "were", "which", "who", "will", "shall", "with", "you", "your", "unto", "also", "even", "yea", "o",
    "le", "la", "les", "de", "des", "du", "et", "un", "une", "il", "elle", "en", "que", "qui", "dans", "pour",
    "est", "a", "au", "aux", "ne", "pas", "se", "sa", "son", "ses", "vous", "nous", "je", "tu", "mon", "ma",
];

/// King James forms and their modern words, so either reading matches either text.
fn modern(word: &str) -> &str {
    match word {
        "thee" | "thou" | "ye" => "you",
        "thy" | "thine" => "your",
        "hath" => "has",
        "doth" => "does",
        "saith" => "says",
        "art" => "are",
        "shalt" | "wilt" => "will",
        "spake" => "spoke",
        _ => word,
    }
}

/// Strip common endings so "love", "loveth", "loved" and "loves" meet.
fn stem(word: &str) -> String {
    let mut stem = word;
    for suffix in ["eth", "est", "ing", "ed", "es", "s"] {
        if let Some(stripped) = word.strip_suffix(suffix) {
            if stripped.chars().count() >= 3 {
                stem = stripped;
                break;
            }
        }
    }
    match stem.strip_suffix('e') {
        Some(stripped) if stripped.chars().count() >= 3 => stripped.to_string(),
        _ => stem.to_string(),
    }
}

pub fn content_words(text: &str) -> Vec<String> {
    crate::bible::spoken_book::fold_accents(&text.to_lowercase())
        .replace(['\'', '’'], "")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(modern)
        .filter(|w| !STOP_WORDS.contains(w))
        .map(stem)
        .collect()
}

fn shared_in_order(a: &[String], b: &[String]) -> usize {
    let mut row = vec![0usize; b.len() + 1];
    for x in a {
        let mut diagonal = 0;
        for (j, y) in b.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = if x == y { diagonal + 1 } else { row[j + 1].max(row[j]) };
            diagonal = above;
        }
    }
    row[b.len()]
}

/// How much of the shorter of the two was said in the other, in order.
pub fn reading_score(heard: &[String], verse: &[String]) -> f32 {
    let shared = shared_in_order(heard, verse);
    let shorter = heard.len().min(verse.len());
    if shorter == 0 || shared < MIN_SHARED {
        return 0.0;
    }
    shared as f32 / shorter as f32
}

/// The verses of `book` `chapter` that `heard` reads from, best first.
pub fn match_reading(conn: &Connection, heard: &str, book_number: i32, chapter: i32) -> Result<Vec<ReadingMatch>, String> {
    let heard = content_words(heard);
    if heard.len() < 3 {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare("SELECT verse, text, translation_id FROM bible_verses WHERE book_number = ?1 AND chapter = ?2")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![book_number, chapter], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })
        .map_err(|e| e.to_string())?;

    let mut best: Vec<ReadingMatch> = Vec::new();
    for row in rows {
        let (verse, text, translation_id) = row.map_err(|e| e.to_string())?;
        let score = reading_score(&heard, &content_words(&text));
        if score < READING_MATCH {
            continue;
        }
        match best.iter_mut().find(|m| m.verse == verse) {
            Some(existing) if existing.score >= score => {}
            Some(existing) => *existing = ReadingMatch { verse, score, translation_id },
            None => best.push(ReadingMatch { verse, score, translation_id }),
        }
    }
    best.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.verse.cmp(&b.verse)));
    best.truncate(3);
    Ok(best)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn john3() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE bible_verses (translation_id TEXT, book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
             INSERT INTO bible_verses VALUES
              ('kjv', 43, 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'),
              ('kjv', 43, 3, 17, 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.'),
              ('kjv', 43, 3, 3, 'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.'),
              ('niv', 43, 3, 17, 'For God did not send his Son into the world to condemn the world, but to save the world through him.'),
              ('lsg', 43, 3, 16, 'Car Dieu a tant aimé le monde qu''il a donné son Fils unique, afin que quiconque croit en lui ne périsse point.');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn finds_the_verse_read_in_modern_words_against_the_kjv() {
        let found = match_reading(&john3(), "you must be born again or you cannot see the kingdom of God", 43, 3).unwrap();
        assert_eq!(found[0].verse, 3, "{found:?}");
    }

    #[test]
    fn finds_a_verse_read_from_another_translation() {
        let found = match_reading(&john3(), "God did not send his Son into the world to condemn the world", 43, 3).unwrap();
        assert_eq!(found[0].verse, 17);
    }

    #[test]
    fn finds_a_verse_read_in_french() {
        let found = match_reading(&john3(), "car Dieu a tant aimé le monde qu'il a donné son Fils unique", 43, 3).unwrap();
        assert_eq!(found[0].verse, 16);
    }

    #[test]
    fn ignores_sermon_talk_that_shares_a_word_or_two() {
        let found = match_reading(&john3(), "the world today needs to hear about God's love for them", 43, 3).unwrap();
        assert!(found.is_empty(), "{found:?}");
    }

    /// Against the installed Bibles: `BSP_DB_FILE=<path to bible-show-pro.db> cargo test reading`.
    #[test]
    fn matches_against_the_installed_bibles() {
        let Ok(path) = std::env::var("BSP_DB_FILE") else { return };
        let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let cases: &[(&str, i32, i32, Option<i32>)] = &[
            ("God loved the world so much that he gave his one and only Son", 43, 3, Some(16)),
            ("the Lord is my shepherd, I lack nothing", 19, 23, Some(1)),
            ("he makes me lie down in green pastures, he leads me beside quiet waters", 19, 23, Some(2)),
            ("we know that in all things God works for the good of those who love him", 45, 8, Some(28)),
            ("so this morning I want us to think about what it means to trust God", 45, 8, None),
        ];
        for (heard, book, chapter, want) in cases {
            let found = match_reading(&conn, heard, *book, *chapter).unwrap();
            println!("{heard:?} → {found:?}");
            assert_eq!(found.first().map(|m| m.verse), *want, "{heard}");
        }
    }

    #[test]
    fn folds_old_forms_and_endings() {
        assert_eq!(content_words("He that believeth on thee"), content_words("he that believes on you"));
    }
}
