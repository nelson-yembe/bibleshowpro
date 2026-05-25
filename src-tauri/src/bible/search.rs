use crate::bible::parser::{parse_reference, ParsedReference};
use crate::bible::search_query::{
    build_fts_query, build_relaxed_fts_query, score_verse_match, tokenize_query, SearchOptions,
};
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerseResult {
    pub id: i64,
    pub translation_id: String,
    pub translation_abbr: String,
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
    pub reference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub verses: Vec<VerseResult>,
    pub parsed_reference: Option<ParsedReference>,
    pub suggestions: Vec<String>,
}

fn map_verse(row: &Row) -> Result<VerseResult, rusqlite::Error> {
    let book_name: String = row.get(5)?;
    let chapter: i32 = row.get(3)?;
    let verse: i32 = row.get(4)?;
    Ok(VerseResult {
        id: row.get(0)?,
        translation_id: row.get(1)?,
        translation_abbr: row.get(2)?,
        book_number: row.get(6)?,
        book_name: book_name.clone(),
        chapter,
        verse,
        text: row.get(7)?,
        reference: format!("{} {}:{}", book_name, chapter, verse),
    })
}

const VERSE_SELECT: &str = "
    SELECT v.id, v.translation_id, t.abbreviation, v.chapter, v.verse, b.name, v.book_number, v.text
    FROM bible_verses v
    JOIN bible_translations t ON t.id = v.translation_id
    JOIN bible_books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
";

const FTS_RESULT_LIMIT: usize = 100;

pub fn lookup_reference(
    conn: &Connection,
    query: &str,
    translation_id: Option<&str>,
    search_options: Option<&SearchOptions>,
) -> Result<SearchResult, String> {
    let suggestions = crate::bible::parser::suggest_references(query);

    if let Some(parsed) = parse_reference(query) {
        let verses = fetch_by_reference(conn, &parsed, translation_id)?;
        return Ok(SearchResult {
            verses,
            parsed_reference: Some(parsed),
            suggestions,
        });
    }

    let opts = search_options.cloned().unwrap_or_default();
    keyword_search(conn, query, translation_id, suggestions, &opts)
}

fn fetch_by_reference(
    conn: &Connection,
    parsed: &ParsedReference,
    translation_id: Option<&str>,
) -> Result<Vec<VerseResult>, String> {
    let default_tid: String = conn
        .query_row(
            "SELECT id FROM bible_translations WHERE is_default = 1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let tid = translation_id.unwrap_or(&default_tid);

    if let (Some(start), Some(end)) = (parsed.verse_start, parsed.verse_end) {
        let sql = format!(
            "{} WHERE v.translation_id = ?1 AND v.book_number = ?2 AND v.chapter = ?3 AND v.verse BETWEEN ?4 AND ?5 ORDER BY v.verse",
            VERSE_SELECT
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![tid, parsed.book_number, parsed.chapter, start, end], map_verse)
            .map_err(|e| e.to_string())?;
        return collect_rows(rows);
    }

    if let Some(start) = parsed.verse_start {
        let sql = format!(
            "{} WHERE v.translation_id = ?1 AND v.book_number = ?2 AND v.chapter = ?3 AND v.verse = ?4 ORDER BY v.verse",
            VERSE_SELECT
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![tid, parsed.book_number, parsed.chapter, start], map_verse)
            .map_err(|e| e.to_string())?;
        return collect_rows(rows);
    }

    let sql = format!(
        "{} WHERE v.translation_id = ?1 AND v.book_number = ?2 AND v.chapter = ?3 ORDER BY v.verse",
        VERSE_SELECT
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tid, parsed.book_number, parsed.chapter], map_verse)
        .map_err(|e| e.to_string())?;
    collect_rows(rows)
}

fn keyword_search(
    conn: &Connection,
    query: &str,
    translation_id: Option<&str>,
    suggestions: Vec<String>,
    opts: &SearchOptions,
) -> Result<SearchResult, String> {
    let tid = resolve_translation_id(conn, translation_id);
    let tokens = tokenize_query(query);

    if tokens.is_empty() {
        return Ok(SearchResult {
            verses: vec![],
            parsed_reference: None,
            suggestions,
        });
    }

    let mut verses = Vec::new();

    if let Some(fts_query) = build_fts_query(&tokens, opts) {
        verses = fts_search(conn, &fts_query, &tid)?;
    }

    if verses.is_empty() {
        if let Some(relaxed) = build_relaxed_fts_query(&tokens) {
            verses = fts_search(conn, &relaxed, &tid)?;
        }
    }

    if verses.is_empty() {
        verses = fallback_like_search(conn, &tid, &tokens, opts)?;
    } else {
        verses = rerank_verses(verses, &tokens, opts);
    }

    Ok(SearchResult {
        verses,
        parsed_reference: None,
        suggestions,
    })
}

fn resolve_translation_id(conn: &Connection, translation_id: Option<&str>) -> String {
    translation_id.map(|s| s.to_string()).unwrap_or_else(|| {
        conn.query_row(
            "SELECT id FROM bible_translations WHERE is_default = 1 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "kjv".to_string())
    })
}

fn fts_search(conn: &Connection, fts_query: &str, tid: &str) -> Result<Vec<VerseResult>, String> {
    let rank_sql = "
        SELECT rowid, bm25(bible_search_index) AS rank
        FROM bible_search_index
        WHERE bible_search_index MATCH ?1 AND translation_id = ?2
        ORDER BY rank
        LIMIT ?3
    ";

    let mut rank_stmt = conn.prepare(rank_sql).map_err(|e| e.to_string())?;
    let ranked_rows = rank_stmt
        .query_map(params![fts_query, tid, FTS_RESULT_LIMIT as i64], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut ids = Vec::new();
    let mut rank_by_id = HashMap::new();
    for row in ranked_rows {
        let (id, rank) = row.map_err(|e| e.to_string())?;
        rank_by_id.insert(id, rank);
        ids.push(id);
    }

    if ids.is_empty() {
        return Ok(vec![]);
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "{} WHERE v.id IN ({})",
        VERSE_SELECT, placeholders
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<Box<dyn rusqlite::ToSql>> = ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), map_verse)
        .map_err(|e| e.to_string())?;

    let mut verses = collect_rows(rows)?;
    verses.sort_by(|a, b| {
        let rank_a = rank_by_id.get(&a.id).copied().unwrap_or(f64::MAX);
        let rank_b = rank_by_id.get(&b.id).copied().unwrap_or(f64::MAX);
        rank_a
            .partial_cmp(&rank_b)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.book_number.cmp(&b.book_number))
            .then_with(|| a.chapter.cmp(&b.chapter))
            .then_with(|| a.verse.cmp(&b.verse))
    });

    Ok(verses)
}

fn fallback_like_search(
    conn: &Connection,
    tid: &str,
    tokens: &[String],
    opts: &SearchOptions,
) -> Result<Vec<VerseResult>, String> {
    let filter_token = tokens
        .iter()
        .max_by_key(|t| t.len())
        .cloned()
        .unwrap_or_default();
    let pattern = format!("%{}%", filter_token.to_lowercase());

    let sql = format!(
        "{} WHERE v.translation_id = ?1 AND lower(v.text) LIKE ?2 ORDER BY v.book_number, v.chapter, v.verse LIMIT 500",
        VERSE_SELECT
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![tid, pattern], map_verse)
        .map_err(|e| e.to_string())?;

    let mut scored: Vec<(i32, VerseResult)> = Vec::new();
    for row in rows {
        let verse = row.map_err(|e| e.to_string())?;
        if let Some(score) = score_verse_match(&verse.text, tokens, opts) {
            scored.push((score, verse));
        }
    }

    scored.sort_by_key(|(score, verse)| (*score, verse.book_number, verse.chapter, verse.verse));
    Ok(scored
        .into_iter()
        .take(FTS_RESULT_LIMIT)
        .map(|(_, verse)| verse)
        .collect())
}

fn rerank_verses(
    verses: Vec<VerseResult>,
    tokens: &[String],
    opts: &SearchOptions,
) -> Vec<VerseResult> {
    let mut with_scores: Vec<(Option<i32>, VerseResult)> = verses
        .into_iter()
        .map(|verse| {
            let score = score_verse_match(&verse.text, tokens, opts);
            (score, verse)
        })
        .collect();

    if with_scores.iter().all(|(score, _)| score.is_none()) {
        return with_scores.into_iter().map(|(_, verse)| verse).collect();
    }

    with_scores.sort_by_key(|(score, verse)| {
        (
            score.unwrap_or(i32::MAX),
            verse.book_number,
            verse.chapter,
            verse.verse,
        )
    });

    with_scores
        .into_iter()
        .map(|(_, verse)| verse)
        .collect()
}

fn collect_rows(
    rows: rusqlite::MappedRows<'_, impl FnMut(&Row) -> Result<VerseResult, rusqlite::Error>>,
) -> Result<Vec<VerseResult>, String> {
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn split_passage(verses: &[VerseResult], max_chars: usize) -> Vec<Vec<VerseResult>> {
    if verses.is_empty() {
        return vec![];
    }

    let mut groups = vec![];
    let mut current = vec![];
    let mut char_count = 0;

    for verse in verses {
        let len = verse.text.len();
        if !current.is_empty() && char_count + len > max_chars {
            groups.push(current);
            current = vec![];
            char_count = 0;
        }
        char_count += len;
        current.push(verse.clone());
    }

    if !current.is_empty() {
        groups.push(current);
    }

    groups
}
