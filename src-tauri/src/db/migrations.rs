use rusqlite::{params, Connection};
const SCHEMA: &str = include_str!("../../../database/schema.sql");

const FTS_STANDALONE: &str = "
CREATE VIRTUAL TABLE IF NOT EXISTS bible_search_index USING fts5(
  verse_text,
  reference,
  translation_id UNINDEXED,
  book_number UNINDEXED,
  chapter UNINDEXED,
  verse UNINDEXED,
  tokenize='unicode61 remove_diacritics 2'
);
";

const SONGS_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  default_key TEXT,
  bpm INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0,
  operator_notes TEXT,
  theme_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS song_sections (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  label TEXT NOT NULL,
  lyrics TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS song_arrangements (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  section_order_json TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lyric_slides (
  id TEXT PRIMARY KEY,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  section_id TEXT REFERENCES song_sections(id) ON DELETE SET NULL,
  slide_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  display_notes TEXT
);

CREATE TABLE IF NOT EXISTS song_copyright (
  song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  author TEXT,
  composer TEXT,
  publisher TEXT,
  copyright_year TEXT,
  ccli_number TEXT,
  license_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_song_sections_song ON song_sections (song_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lyric_slides_song ON lyric_slides (song_id, slide_order);
CREATE INDEX IF NOT EXISTS idx_songs_last_used ON songs (last_used_at DESC);
";

/// Runs schema migrations. Returns `true` when the FTS index should be rebuilt
/// in the background (never block app startup on a full repopulate).
pub fn run_migrations(conn: &Connection) -> Result<bool, String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .map_err(|e| e.to_string())?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut needs_fts_rebuild = false;

    if current < 1 {
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (1)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // v2: replace external-content FTS (broken — bible_verses has no verse_text column)
    if current < 2 {
        conn.execute("DROP TABLE IF EXISTS bible_search_index", [])
            .map_err(|e| e.to_string())?;
        conn.execute_batch(FTS_STANDALONE)
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (2)",
            [],
        )
        .map_err(|e| e.to_string())?;
        needs_fts_rebuild = true;
    }

    if current < 3 {
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (3)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // v4: unicode61 tokenizer with diacritic folding for easier multilingual search
    if current < 4 {
        conn.execute("DROP TABLE IF EXISTS bible_search_index", [])
            .map_err(|e| e.to_string())?;
        conn.execute_batch(FTS_STANDALONE)
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (4)",
            [],
        )
        .map_err(|e| e.to_string())?;
        needs_fts_rebuild = true;
    }

    if current < 5 {
        conn.execute_batch(SONGS_SCHEMA)
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (5)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    if current < 6 {
        conn.execute(
            "ALTER TABLE song_sections ADD COLUMN lines_per_slide INTEGER",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO schema_migrations (version) VALUES (6)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    if !needs_fts_rebuild && fts_index_needs_repopulate(conn)? {
        needs_fts_rebuild = true;
    }

    Ok(needs_fts_rebuild)
}

fn fts_index_needs_repopulate(conn: &Connection) -> Result<bool, String> {
    let verse_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM bible_verses", [], |row| row.get(0))
        .unwrap_or(0);
    if verse_count == 0 {
        return Ok(false);
    }

    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM bible_search_index", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(fts_count == 0)
}

pub fn repopulate_fts(conn: &Connection) -> Result<(), String> {
    let mut select = conn
        .prepare(
            "SELECT v.id, v.translation_id, v.book_number, v.chapter, v.verse, v.text, b.name
             FROM bible_verses v
             JOIN bible_books b
               ON b.translation_id = v.translation_id AND b.book_number = v.book_number",
        )
        .map_err(|e| e.to_string())?;

    let rows = select
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM bible_search_index", [])
        .map_err(|e| e.to_string())?;
    {
        let mut insert = tx
            .prepare(
                "INSERT INTO bible_search_index(rowid, verse_text, reference, translation_id, book_number, chapter, verse)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;

        for (id, translation_id, book_number, chapter, verse, text, book_name) in rows {
            let reference = format!("{book_name} {chapter}:{verse}");
            insert
                .execute(params![
                    id,
                    text,
                    reference,
                    translation_id,
                    book_number,
                    chapter,
                    verse
                ])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sync_verse_to_fts(
    conn: &Connection,
    rowid: i64,
    translation_id: &str,
    book_number: i32,
    chapter: i32,
    verse: i32,
    book_name: &str,
    text: &str,
) -> Result<(), String> {
    let reference = format!("{} {}:{}", book_name, chapter, verse);
    conn.execute(
        "INSERT INTO bible_search_index(rowid, verse_text, reference, translation_id, book_number, chapter, verse)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![rowid, text, reference, translation_id, book_number, chapter, verse],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
