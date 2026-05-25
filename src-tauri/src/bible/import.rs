use rusqlite::{params, Connection};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ImportPayload {
    pub translation: ImportTranslation,
    pub books: Vec<ImportBook>,
    pub verses: Vec<ImportVerse>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportTranslation {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub copyright: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportBook {
    pub book_number: i32,
    pub name: String,
    pub abbreviation: String,
    pub testament: String,
    pub chapter_count: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImportVerse {
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct ImportStats {
    pub translation_id: String,
    pub abbreviation: String,
    pub verse_count: usize,
}

pub fn import_bible(conn: &Connection, json: &str) -> Result<String, String> {
    let payload: ImportPayload = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let stats = import_payload(conn, &payload, payload.translation.id == "kjv")?;
    Ok(format!(
        "Imported {} verses for {}",
        stats.verse_count, stats.abbreviation
    ))
}

pub fn import_payload(
    conn: &Connection,
    payload: &ImportPayload,
    set_default: bool,
) -> Result<ImportStats, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO bible_translations (id, name, abbreviation, language, copyright, is_default)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           abbreviation = excluded.abbreviation,
           language = excluded.language,
           copyright = excluded.copyright",
        params![
            payload.translation.id,
            payload.translation.name,
            payload.translation.abbreviation,
            payload.translation.language,
            payload.translation.copyright,
            if set_default { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;

    if set_default {
        tx.execute(
            "UPDATE bible_translations SET is_default = 0 WHERE id != ?1",
            params![payload.translation.id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE bible_translations SET is_default = 1 WHERE id = ?1",
            params![payload.translation.id],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut book_names = std::collections::HashMap::new();
    for book in &payload.books {
        book_names.insert(book.book_number, book.name.clone());
        tx.execute(
            "INSERT INTO bible_books (translation_id, book_number, name, abbreviation, testament, chapter_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(translation_id, book_number) DO UPDATE SET
               name = excluded.name,
               abbreviation = excluded.abbreviation,
               testament = excluded.testament,
               chapter_count = excluded.chapter_count",
            params![
                payload.translation.id,
                book.book_number,
                book.name,
                book.abbreviation,
                book.testament,
                book.chapter_count
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "DELETE FROM bible_search_index WHERE rowid IN (
            SELECT id FROM bible_verses WHERE translation_id = ?1
         )",
        params![payload.translation.id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM bible_verses WHERE translation_id = ?1",
        params![payload.translation.id],
    )
    .map_err(|e| e.to_string())?;

    let mut verse_stmt = tx
        .prepare(
            "INSERT INTO bible_verses (translation_id, book_number, chapter, verse, text)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|e| e.to_string())?;

    let mut fts_stmt = tx
        .prepare(
            "INSERT INTO bible_search_index(rowid, verse_text, reference, translation_id, book_number, chapter, verse)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0usize;
    for v in &payload.verses {
        verse_stmt
            .execute(params![
                payload.translation.id,
                v.book_number,
                v.chapter,
                v.verse,
                v.text
            ])
            .map_err(|e| e.to_string())?;

        let rowid = tx.last_insert_rowid();
        let book_name = book_names
            .get(&v.book_number)
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());
        let reference = format!("{} {}:{}", book_name, v.chapter, v.verse);

        fts_stmt
            .execute(params![
                rowid,
                v.text,
                reference,
                payload.translation.id,
                v.book_number,
                v.chapter,
                v.verse
            ])
            .map_err(|e| e.to_string())?;
        count += 1;
    }

    drop(verse_stmt);
    drop(fts_stmt);
    tx.commit().map_err(|e| e.to_string())?;

    Ok(ImportStats {
        translation_id: payload.translation.id.clone(),
        abbreviation: payload.translation.abbreviation.clone(),
        verse_count: count,
    })
}

pub fn delete_translation(conn: &Connection, translation_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM bible_search_index WHERE rowid IN (
            SELECT id FROM bible_verses WHERE translation_id = ?1
         )",
        params![translation_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bible_verses WHERE translation_id = ?1",
        params![translation_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bible_books WHERE translation_id = ?1",
        params![translation_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM bible_translations WHERE id = ?1",
        params![translation_id],
    )
    .map_err(|e| format!("{e}"))?;
    Ok(())
}

pub fn set_default_translation(conn: &Connection, translation_id: &str) -> Result<(), String> {
    conn.execute("UPDATE bible_translations SET is_default = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE bible_translations SET is_default = 1 WHERE id = ?1",
        params![translation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn verse_count_for_translation(conn: &Connection, translation_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM bible_verses WHERE translation_id = ?1",
        params![translation_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}
