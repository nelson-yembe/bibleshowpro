//! Scripture for the phone remote: the installed translations, a reference or words looked
//! up, and a chosen passage sent to the operator's screen.

use crate::bible::parser::ParsedReference;
use crate::bible::search::{fetch_by_reference, lookup_reference, VerseResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// A search by words can match hundreds of verses; a phone needs the best few.
const MAX_SEARCH_RESULTS: usize = 40;
/// Longer than this is a reading, not a slide: show it in parts.
pub const MAX_PASSAGE_VERSES: i32 = 20;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranslationView {
    pub id: String,
    pub abbreviation: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VerseView {
    pub book_number: i32,
    pub book: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

impl From<VerseResult> for VerseView {
    fn from(v: VerseResult) -> Self {
        Self {
            book_number: v.book_number,
            book: v.book_name,
            chapter: v.chapter,
            verse: v.verse,
            text: v.text,
        }
    }
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lookup {
    /// "John 3" for a chapter, or the words searched for.
    pub title: String,
    pub verses: Vec<VerseView>,
    /// Verses from different chapters (a search), rather than one chapter in order.
    pub from_search: bool,
    /// The verses a reference named ("John 3:16-18" → 16..=18), to select on the phone.
    pub selected: Option<(i32, i32)>,
}

pub fn translations(conn: &Connection) -> Result<Vec<TranslationView>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, abbreviation, name, is_default FROM bible_translations
             ORDER BY is_default DESC, abbreviation",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TranslationView {
                id: row.get(0)?,
                abbreviation: row.get(1)?,
                name: row.get(2)?,
                is_default: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn chapter_reference(book_number: i32, chapter: i32) -> ParsedReference {
    ParsedReference {
        book_number,
        book_name: String::new(),
        chapter,
        verse_start: None,
        verse_end: None,
    }
}

/// A reference opens its whole chapter with the named verses selected, so the phone can
/// step on through the chapter. Anything else is searched as words.
pub fn lookup(conn: &Connection, query: &str, translation: &str) -> Result<Lookup, String> {
    let found = lookup_reference(conn, query, Some(translation), None)?;
    if let Some(parsed) = found.parsed_reference {
        let verses = fetch_by_reference(conn, &chapter_reference(parsed.book_number, parsed.chapter), Some(translation))?;
        let title = verses
            .first()
            .map(|v| format!("{} {}", v.book_name, v.chapter))
            .unwrap_or_else(|| query.trim().to_string());
        let selected = parsed.verse_start.map(|start| (start, parsed.verse_end.unwrap_or(start)));
        return Ok(Lookup {
            title,
            verses: verses.into_iter().map(VerseView::from).collect(),
            from_search: false,
            selected,
        });
    }
    Ok(Lookup {
        title: query.trim().to_string(),
        verses: found.verses.into_iter().take(MAX_SEARCH_RESULTS).map(VerseView::from).collect(),
        from_search: true,
        selected: None,
    })
}

pub fn chapter(conn: &Connection, translation: &str, book_number: i32, chapter: i32) -> Result<Lookup, String> {
    let verses = fetch_by_reference(conn, &chapter_reference(book_number, chapter), Some(translation))?;
    let title = verses
        .first()
        .map(|v| format!("{} {}", v.book_name, v.chapter))
        .ok_or("That chapter is not in this translation.")?;
    Ok(Lookup {
        title,
        verses: verses.into_iter().map(VerseView::from).collect(),
        from_search: false,
        selected: None,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Passage {
    pub translation: String,
    pub book_number: i32,
    pub chapter: i32,
    pub start: i32,
    pub end: i32,
}

/// The verses to put on screen, in full, as the app presents them.
pub fn passage(conn: &Connection, passage: &Passage) -> Result<Vec<VerseResult>, String> {
    let (start, end) = (passage.start.min(passage.end), passage.start.max(passage.end));
    if end - start + 1 > MAX_PASSAGE_VERSES {
        return Err(format!("Choose at most {MAX_PASSAGE_VERSES} verses at a time."));
    }
    let reference = ParsedReference {
        book_number: passage.book_number,
        book_name: String::new(),
        chapter: passage.chapter,
        verse_start: Some(start),
        verse_end: Some(end),
    };
    let verses = fetch_by_reference(conn, &reference, Some(&passage.translation))?;
    if verses.is_empty() {
        return Err("Those verses are not in this translation.".into());
    }
    Ok(verses)
}

/// A small Bible in a database file, for the server tests.
#[cfg(test)]
pub fn test_bible() -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("bsp-remote-bible-{}.db", uuid::Uuid::new_v4()));
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "CREATE TABLE bible_translations (id TEXT PRIMARY KEY, name TEXT, abbreviation TEXT, language TEXT, copyright TEXT, is_default INTEGER);
         CREATE TABLE bible_books (translation_id TEXT, book_number INTEGER, name TEXT);
         CREATE TABLE bible_verses (id INTEGER PRIMARY KEY, translation_id TEXT, book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
         INSERT INTO bible_translations VALUES ('kjv', 'King James Version', 'KJV', 'en', 'Public Domain', 1), ('lsg', 'Louis Segond', 'LSG', 'fr', 'Public Domain', 0);
         INSERT INTO bible_books VALUES ('kjv', 43, 'John'), ('lsg', 43, 'Jean');",
    )
    .unwrap();
    let mut insert = conn
        .prepare("INSERT INTO bible_verses (translation_id, book_number, chapter, verse, text) VALUES (?1, 43, 3, ?2, ?3)")
        .unwrap();
    for verse in 1..=36 {
        insert.execute(params!["kjv", verse, format!("John three verse {verse}")]).unwrap();
        insert.execute(params!["lsg", verse, format!("Jean trois verset {verse}")]).unwrap();
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_the_default_translation_first() {
        let conn = Connection::open(test_bible()).unwrap();
        let list = translations(&conn).unwrap();
        assert_eq!(list.iter().map(|t| t.abbreviation.as_str()).collect::<Vec<_>>(), vec!["KJV", "LSG"]);
        assert!(list[0].is_default);
    }

    #[test]
    fn a_reference_opens_its_chapter_with_the_verses_selected() {
        let conn = Connection::open(test_bible()).unwrap();
        let found = lookup(&conn, "John 3:16-18", "kjv").unwrap();
        assert_eq!(found.title, "John 3");
        assert_eq!(found.verses.len(), 36);
        assert_eq!(found.selected, Some((16, 18)));
        assert!(!found.from_search);
    }

    #[test]
    fn reads_the_chosen_translation() {
        let conn = Connection::open(test_bible()).unwrap();
        let found = chapter(&conn, "lsg", 43, 3).unwrap();
        assert_eq!(found.title, "Jean 3");
        assert_eq!(found.verses[15].text, "Jean trois verset 16");
    }

    #[test]
    fn gives_the_passage_to_show_and_refuses_a_whole_reading() {
        let conn = Connection::open(test_bible()).unwrap();
        let pick = |start, end| Passage { translation: "kjv".into(), book_number: 43, chapter: 3, start, end };
        let verses = passage(&conn, &pick(17, 16)).unwrap();
        assert_eq!(verses.iter().map(|v| v.verse).collect::<Vec<_>>(), vec![16, 17]);
        assert_eq!(verses[0].reference, "John 3:16");
        assert!(passage(&conn, &pick(1, 36)).unwrap_err().contains("at most"));
        assert!(passage(&conn, &pick(40, 41)).is_err());
    }
}
