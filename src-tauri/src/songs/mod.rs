use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongSummary {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub default_key: Option<String>,
    pub bpm: Option<i32>,
    pub tags_json: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub section_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongSection {
    pub id: String,
    pub song_id: String,
    pub section_type: String,
    pub label: String,
    pub lyrics: String,
    pub sort_order: i32,
    pub lines_per_slide: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongArrangement {
    pub id: String,
    pub song_id: String,
    pub name: String,
    pub section_order_json: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricSlide {
    pub id: String,
    pub song_id: String,
    pub section_id: Option<String>,
    pub section_label: Option<String>,
    pub slide_order: i32,
    pub text: String,
    pub display_notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongCopyright {
    pub song_id: String,
    pub author: Option<String>,
    pub composer: Option<String>,
    pub publisher: Option<String>,
    pub copyright_year: Option<String>,
    pub ccli_number: Option<String>,
    pub license_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongTheme {
    pub mode: String,
    pub font_family: Option<String>,
    pub font_size: Option<i32>,
    pub text_color: Option<String>,
    pub background_type: Option<String>,
    pub background_value: Option<String>,
    pub lower_third_position: Option<String>,
    pub show_copyright_footer: bool,
}

impl Default for SongTheme {
    fn default() -> Self {
        Self {
            mode: "fullscreen".to_string(),
            font_family: None,
            font_size: Some(48),
            text_color: None,
            background_type: Some("solid".to_string()),
            background_value: None,
            lower_third_position: Some("bottom".to_string()),
            show_copyright_footer: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongDetail {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub default_key: Option<String>,
    pub bpm: Option<i32>,
    pub tags_json: String,
    pub favorite: bool,
    pub operator_notes: Option<String>,
    pub theme_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_used_at: Option<String>,
    pub sections: Vec<SongSection>,
    pub arrangements: Vec<SongArrangement>,
    pub slides: Vec<LyricSlide>,
    pub copyright: Option<SongCopyright>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSongInput {
    pub title: String,
    pub artist: Option<String>,
    pub default_key: Option<String>,
    pub bpm: Option<i32>,
    pub tags_json: Option<String>,
    pub operator_notes: Option<String>,
    pub theme_json: Option<String>,
    pub sections: Vec<SectionInput>,
    pub arrangement: Option<Vec<String>>,
    pub copyright: Option<SongCopyrightInput>,
    pub lines_per_slide: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionInput {
    #[serde(default)]
    pub id: Option<String>,
    pub section_type: String,
    pub label: String,
    pub lyrics: String,
    pub sort_order: i32,
    pub lines_per_slide: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongCopyrightInput {
    pub author: Option<String>,
    pub composer: Option<String>,
    pub publisher: Option<String>,
    pub copyright_year: Option<String>,
    pub ccli_number: Option<String>,
    pub license_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSongInput {
    pub id: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub default_key: Option<String>,
    pub bpm: Option<i32>,
    pub tags_json: Option<String>,
    pub favorite: Option<bool>,
    pub operator_notes: Option<String>,
    pub theme_json: Option<String>,
    pub sections: Option<Vec<SectionInput>>,
    pub arrangement_section_ids: Option<Vec<String>>,
    pub arrangement_name: Option<String>,
    pub copyright: Option<SongCopyrightInput>,
    pub lines_per_slide: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSongResult {
    pub song: SongDetail,
    pub duplicate_of: Option<String>,
}

pub fn list_songs(conn: &Connection, filter: Option<&str>, query: Option<&str>) -> Result<Vec<SongSummary>, String> {
    let mut sql = String::from(
        "SELECT s.id, s.title, s.artist, s.default_key, s.bpm, s.tags_json, s.favorite,
                s.created_at, s.updated_at, s.last_used_at,
                (SELECT COUNT(*) FROM song_sections ss WHERE ss.song_id = s.id) AS section_count
         FROM songs s WHERE 1=1",
    );
    let q = query.unwrap_or("").trim().to_lowercase();
    let filter = filter.unwrap_or("all");

    match filter {
        "favorites" => sql.push_str(" AND s.favorite = 1"),
        "recent" => sql.push_str(" AND s.last_used_at IS NOT NULL"),
        tag if tag.starts_with("tag:") => {
            let tag_name = tag.trim_start_matches("tag:");
            sql.push_str(&format!(" AND lower(s.tags_json) LIKE '%{}%'", tag_name.replace('\'', "''")));
        }
        _ => {}
    }

    if !q.is_empty() {
        sql.push_str(
            " AND (lower(s.title) LIKE ?1 OR lower(COALESCE(s.artist,'')) LIKE ?1
               OR lower(s.tags_json) LIKE ?1
               OR EXISTS (SELECT 1 FROM song_sections sec WHERE sec.song_id = s.id AND lower(sec.lyrics) LIKE ?1))",
        );
    }

    sql.push_str(" ORDER BY COALESCE(s.last_used_at, s.updated_at) DESC, s.title ASC");

    let like = if q.is_empty() { None } else { Some(format!("%{q}%")) };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if let Some(ref pattern) = like {
        stmt.query_map(params![pattern], map_song_summary)
    } else {
        stmt.query_map([], map_song_summary)
    }
    .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn map_song_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<SongSummary> {
    Ok(SongSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        artist: row.get(2)?,
        default_key: row.get(3)?,
        bpm: row.get(4)?,
        tags_json: row.get(5)?,
        favorite: row.get::<_, i32>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        last_used_at: row.get(9)?,
        section_count: row.get(10)?,
    })
}

pub fn get_song(conn: &Connection, id: &str) -> Result<SongDetail, String> {
    let base = conn
        .query_row(
            "SELECT id, title, artist, default_key, bpm, tags_json, favorite, operator_notes,
                    theme_json, created_at, updated_at, last_used_at
             FROM songs WHERE id = ?1",
            params![id],
            |row| {
                Ok(SongDetail {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    default_key: row.get(3)?,
                    bpm: row.get(4)?,
                    tags_json: row.get(5)?,
                    favorite: row.get::<_, i32>(6)? != 0,
                    operator_notes: row.get(7)?,
                    theme_json: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    last_used_at: row.get(11)?,
                    sections: vec![],
                    arrangements: vec![],
                    slides: vec![],
                    copyright: None,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut detail = base;
    detail.sections = load_sections(conn, id)?;
    detail.arrangements = load_arrangements(conn, id)?;
    detail.slides = load_slides(conn, id)?;
    detail.copyright = load_copyright(conn, id)?;

    let has_lyrics = detail.sections.iter().any(|s| !s.lyrics.trim().is_empty());
    let order = arrangement_section_ids(conn, id, &detail)?;
    let current = section_ids_by_sort_order(&detail.sections);
    if order != current {
        sync_section_sort_orders(conn, id, &order)?;
        detail.sections = load_sections(conn, id)?;
    }

    if detail.slides.is_empty() && has_lyrics {
        rebuild_slides(conn, id, &order, 4)?;
        detail.slides = load_slides(conn, id)?;
    }

    Ok(detail)
}

fn load_sections(conn: &Connection, song_id: &str) -> Result<Vec<SongSection>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, song_id, section_type, label, lyrics, sort_order, lines_per_slide
             FROM song_sections WHERE song_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![song_id], |row| {
            Ok(SongSection {
                id: row.get(0)?,
                song_id: row.get(1)?,
                section_type: row.get(2)?,
                label: row.get(3)?,
                lyrics: row.get(4)?,
                sort_order: row.get(5)?,
                lines_per_slide: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn load_arrangements(conn: &Connection, song_id: &str) -> Result<Vec<SongArrangement>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, song_id, name, section_order_json, is_default
             FROM song_arrangements WHERE song_id = ?1 ORDER BY is_default DESC, name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![song_id], |row| {
            Ok(SongArrangement {
                id: row.get(0)?,
                song_id: row.get(1)?,
                name: row.get(2)?,
                section_order_json: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn load_slides(conn: &Connection, song_id: &str) -> Result<Vec<LyricSlide>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ls.id, ls.song_id, ls.section_id, ss.label, ls.slide_order, ls.text, ls.display_notes
             FROM lyric_slides ls
             LEFT JOIN song_sections ss ON ss.id = ls.section_id
             WHERE ls.song_id = ?1 ORDER BY ls.slide_order",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![song_id], |row| {
            Ok(LyricSlide {
                id: row.get(0)?,
                song_id: row.get(1)?,
                section_id: row.get(2)?,
                section_label: row.get(3)?,
                slide_order: row.get(4)?,
                text: row.get(5)?,
                display_notes: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn load_copyright(conn: &Connection, song_id: &str) -> Result<Option<SongCopyright>, String> {
    conn.query_row(
        "SELECT song_id, author, composer, publisher, copyright_year, ccli_number, license_text
         FROM song_copyright WHERE song_id = ?1",
        params![song_id],
        |row| {
            Ok(SongCopyright {
                song_id: row.get(0)?,
                author: row.get(1)?,
                composer: row.get(2)?,
                publisher: row.get(3)?,
                copyright_year: row.get(4)?,
                ccli_number: row.get(5)?,
                license_text: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn find_duplicate_title(conn: &Connection, title: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM songs WHERE lower(trim(title)) = lower(trim(?1)) LIMIT 1",
        params![title],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn create_song(conn: &Connection, input: &CreateSongInput) -> Result<SongDetail, String> {
    let duplicate_of = find_duplicate_title(conn, &input.title)?;
    let id = Uuid::new_v4().to_string();
    let tags = input.tags_json.clone().unwrap_or_else(|| "[]".to_string());
    let theme = input
        .theme_json
        .clone()
        .unwrap_or_else(|| serde_json::to_string(&SongTheme::default()).unwrap_or_else(|_| "{}".to_string()));

    conn.execute(
        "INSERT INTO songs (id, title, artist, default_key, bpm, tags_json, operator_notes, theme_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            input.title.trim(),
            input.artist,
            input.default_key,
            input.bpm,
            tags,
            input.operator_notes,
            theme,
        ],
    )
    .map_err(|e| e.to_string())?;

    let section_ids = insert_sections(conn, &id, &input.sections)?;
    save_copyright(conn, &id, input.copyright.as_ref())?;

    let order = if let Some(arr) = &input.arrangement {
        arr.clone()
    } else {
        section_ids.clone()
    };
    create_arrangement(conn, &id, "Default", &order, true)?;

    let lines = input.lines_per_slide.unwrap_or(4).max(1);
    rebuild_slides(conn, &id, &order, lines)?;

    let mut song = get_song(conn, &id)?;
    if duplicate_of.is_some() {
        // still created; caller handles warning
    }
    Ok(song)
}

pub fn import_song_from_text(
    conn: &Connection,
    title: String,
    artist: Option<String>,
    raw_text: String,
    tags_json: Option<String>,
) -> Result<ImportSongResult, String> {
    let parsed = parse_song_from_text(&raw_text);
    let final_title = parsed
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or(title);
    let final_artist = parsed
        .artist
        .filter(|a| !a.trim().is_empty())
        .or(artist);
    let arrangement = if parsed.arrangement.is_empty() {
        None
    } else {
        Some(parsed.arrangement)
    };
    let duplicate_of = find_duplicate_title(conn, &final_title)?;
    let input = CreateSongInput {
        title: final_title,
        artist: final_artist,
        default_key: None,
        bpm: None,
        tags_json,
        operator_notes: None,
        theme_json: None,
        sections: parsed.sections,
        arrangement,
        copyright: None,
        lines_per_slide: Some(4),
    };
    let song = create_song(conn, &input)?;
    Ok(ImportSongResult { song, duplicate_of })
}

pub fn update_song(conn: &Connection, input: &UpdateSongInput) -> Result<SongDetail, String> {
    if let Some(title) = &input.title {
        conn.execute(
            "UPDATE songs SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![title.trim(), input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if input.artist.is_some() {
        conn.execute(
            "UPDATE songs SET artist = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![input.artist, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if input.default_key.is_some() {
        conn.execute(
            "UPDATE songs SET default_key = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![input.default_key, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if input.bpm.is_some() {
        conn.execute(
            "UPDATE songs SET bpm = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![input.bpm, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(tags) = &input.tags_json {
        conn.execute(
            "UPDATE songs SET tags_json = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![tags, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(fav) = input.favorite {
        conn.execute(
            "UPDATE songs SET favorite = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![if fav { 1 } else { 0 }, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if input.operator_notes.is_some() {
        conn.execute(
            "UPDATE songs SET operator_notes = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![input.operator_notes, input.id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(theme) = &input.theme_json {
        conn.execute(
            "UPDATE songs SET theme_json = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![theme, input.id],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut section_order: Option<Vec<String>> = None;
    if let Some(sections) = &input.sections {
        let old_sections = load_sections(conn, &input.id)?;
        let old_id_to_sort: std::collections::HashMap<String, i32> = old_sections
            .iter()
            .map(|s| (s.id.clone(), s.sort_order))
            .collect();

        conn.execute("DELETE FROM song_sections WHERE song_id = ?1", params![input.id])
            .map_err(|e| e.to_string())?;
        let new_ids = insert_sections(conn, &input.id, sections)?;

        let resolved_order = resolve_arrangement_order(
            input.arrangement_section_ids.as_deref(),
            &old_id_to_sort,
            sections,
            &new_ids,
        );

        update_default_arrangement(conn, &input.id, &resolved_order, input.arrangement_name.as_deref())?;
        sync_section_sort_orders(conn, &input.id, &resolved_order)?;
        section_order = Some(resolved_order);
    } else if let Some(order) = &input.arrangement_section_ids {
        update_default_arrangement(conn, &input.id, order, input.arrangement_name.as_deref())?;
        sync_section_sort_orders(conn, &input.id, order)?;
        section_order = Some(order.clone());
    }

    if let Some(copyright) = &input.copyright {
        save_copyright(conn, &input.id, Some(copyright))?;
    }

    if section_order.is_some() || input.lines_per_slide.is_some() {
        let detail = get_song(conn, &input.id)?;
        let arrangement = detail
            .arrangements
            .iter()
            .find(|a| a.is_default)
            .ok_or_else(|| "No default arrangement".to_string())?;
        let order: Vec<String> = serde_json::from_str(&arrangement.section_order_json)
            .unwrap_or_default();
        let lines = input.lines_per_slide.unwrap_or(4).max(1);
        rebuild_slides(conn, &input.id, &order, lines)?;
    } else {
        conn.execute(
            "UPDATE songs SET updated_at = datetime('now') WHERE id = ?1",
            params![input.id],
        )
        .map_err(|e| e.to_string())?;
    }

    get_song(conn, &input.id)
}

pub fn delete_song(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM songs WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn duplicate_song(conn: &Connection, id: &str) -> Result<SongDetail, String> {
    let source = get_song(conn, id)?;
    let input = CreateSongInput {
        title: format!("{} (Copy)", source.title),
        artist: source.artist.clone(),
        default_key: source.default_key.clone(),
        bpm: source.bpm,
        tags_json: Some(source.tags_json.clone()),
        operator_notes: source.operator_notes.clone(),
        theme_json: Some(source.theme_json.clone()),
        sections: source
            .sections
            .iter()
            .map(|s| SectionInput {
                id: None,
                section_type: s.section_type.clone(),
                label: s.label.clone(),
                lyrics: s.lyrics.clone(),
                sort_order: s.sort_order,
                lines_per_slide: s.lines_per_slide,
            })
            .collect(),
        arrangement: source
            .arrangements
            .iter()
            .find(|a| a.is_default)
            .and_then(|a| serde_json::from_str(&a.section_order_json).ok()),
        copyright: source.copyright.as_ref().map(|c| SongCopyrightInput {
            author: c.author.clone(),
            composer: c.composer.clone(),
            publisher: c.publisher.clone(),
            copyright_year: c.copyright_year.clone(),
            ccli_number: c.ccli_number.clone(),
            license_text: c.license_text.clone(),
        }),
        lines_per_slide: Some(4),
    };
    create_song(conn, &input)
}

pub fn mark_song_used(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE songs SET last_used_at = datetime('now') WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn export_songs_library(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM songs ORDER BY title")
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut songs = Vec::new();
    for id in ids {
        songs.push(get_song(conn, &id)?);
    }
    serde_json::to_string_pretty(&songs).map_err(|e| e.to_string())
}

fn sync_section_sort_orders(conn: &Connection, song_id: &str, section_order: &[String]) -> Result<(), String> {
    for (index, section_id) in section_order.iter().enumerate() {
        conn.execute(
            "UPDATE song_sections SET sort_order = ?1 WHERE id = ?2 AND song_id = ?3",
            params![index as i32, section_id, song_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn section_ids_by_sort_order(sections: &[SongSection]) -> Vec<String> {
    let mut sorted = sections.to_vec();
    sorted.sort_by_key(|s| s.sort_order);
    sorted.into_iter().map(|s| s.id).collect()
}

fn arrangement_section_ids(_conn: &Connection, _song_id: &str, detail: &SongDetail) -> Result<Vec<String>, String> {
    let mut order = if let Some(arr) = detail.arrangements.iter().find(|a| a.is_default) {
        let parsed: Vec<String> = serde_json::from_str(&arr.section_order_json).unwrap_or_default();
        let valid: Vec<String> = parsed
            .into_iter()
            .filter(|id| detail.sections.iter().any(|s| s.id == *id))
            .collect();
        if valid.is_empty() {
            section_ids_by_sort_order(&detail.sections)
        } else {
            valid
        }
    } else {
        section_ids_by_sort_order(&detail.sections)
    };

    let mut sorted_sections = detail.sections.clone();
    sorted_sections.sort_by_key(|s| s.sort_order);
    for section in sorted_sections.iter().filter(|s| !s.lyrics.trim().is_empty()) {
        if !order.iter().any(|id| id == &section.id) {
            order.push(section.id.clone());
        }
    }

    Ok(order)
}

fn resolve_arrangement_order(
    arr_order: Option<&[String]>,
    old_id_to_sort: &std::collections::HashMap<String, i32>,
    sections: &[SectionInput],
    new_ids: &[String],
) -> Vec<String> {
    let Some(arr_order) = arr_order else {
        return new_ids.to_vec();
    };

    let input_id_to_new: std::collections::HashMap<String, String> = sections
        .iter()
        .zip(new_ids.iter())
        .filter_map(|(section, new_id)| {
            section
                .id
                .as_ref()
                .filter(|id| !id.is_empty())
                .map(|id| (id.clone(), new_id.clone()))
        })
        .collect();

    let mut order = Vec::new();
    let mut used = std::collections::HashSet::new();

    for arr_id in arr_order {
        if let Some(new_id) = input_id_to_new.get(arr_id) {
            if used.insert(new_id.clone()) {
                order.push(new_id.clone());
            }
            continue;
        }
        if let Some(sort) = old_id_to_sort.get(arr_id) {
            if let Some(idx) = sections.iter().position(|s| s.sort_order == *sort) {
                if let Some(new_id) = new_ids.get(idx) {
                    if used.insert(new_id.clone()) {
                        order.push(new_id.clone());
                    }
                }
            }
        }
    }

    for new_id in new_ids {
        if used.insert(new_id.clone()) {
            order.push(new_id.clone());
        }
    }

    if order.is_empty() {
        new_ids.to_vec()
    } else {
        order
    }
}

fn insert_sections(conn: &Connection, song_id: &str, sections: &[SectionInput]) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for section in sections {
        let id = section
            .id
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        conn.execute(
            "INSERT INTO song_sections (id, song_id, section_type, label, lyrics, sort_order, lines_per_slide)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                song_id,
                section.section_type,
                section.label,
                section.lyrics,
                section.sort_order,
                section.lines_per_slide,
            ],
        )
        .map_err(|e| e.to_string())?;
        ids.push(id);
    }
    Ok(ids)
}

fn save_copyright(conn: &Connection, song_id: &str, copyright: Option<&SongCopyrightInput>) -> Result<(), String> {
    let Some(c) = copyright else { return Ok(()); };
    conn.execute(
        "INSERT INTO song_copyright (song_id, author, composer, publisher, copyright_year, ccli_number, license_text)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(song_id) DO UPDATE SET
           author = excluded.author,
           composer = excluded.composer,
           publisher = excluded.publisher,
           copyright_year = excluded.copyright_year,
           ccli_number = excluded.ccli_number,
           license_text = excluded.license_text",
        params![
            song_id,
            c.author,
            c.composer,
            c.publisher,
            c.copyright_year,
            c.ccli_number,
            c.license_text,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn create_arrangement(
    conn: &Connection,
    song_id: &str,
    name: &str,
    section_ids: &[String],
    is_default: bool,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let order_json = serde_json::to_string(section_ids).map_err(|e| e.to_string())?;
    if is_default {
        conn.execute(
            "UPDATE song_arrangements SET is_default = 0 WHERE song_id = ?1",
            params![song_id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO song_arrangements (id, song_id, name, section_order_json, is_default)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, song_id, name, order_json, if is_default { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

fn update_default_arrangement(
    conn: &Connection,
    song_id: &str,
    section_ids: &[String],
    name: Option<&str>,
) -> Result<(), String> {
    let order_json = serde_json::to_string(section_ids).map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE song_arrangements SET section_order_json = ?1, name = COALESCE(?2, name)
             WHERE song_id = ?3 AND is_default = 1",
            params![order_json, name, song_id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        create_arrangement(conn, song_id, name.unwrap_or("Default"), section_ids, true)?;
    }
    Ok(())
}

pub fn rebuild_slides(conn: &Connection, song_id: &str, section_order: &[String], lines_per_slide: i32) -> Result<(), String> {
    conn.execute("DELETE FROM lyric_slides WHERE song_id = ?1", params![song_id])
        .map_err(|e| e.to_string())?;

    let sections = load_sections(conn, song_id)?;
    let section_map: std::collections::HashMap<String, &SongSection> =
        sections.iter().map(|s| (s.id.clone(), s)).collect();

    let mut slide_order = 0i32;
    for section_id in section_order {
        let Some(section) = section_map.get(section_id) else { continue };
        let section_lines = section
            .lines_per_slide
            .unwrap_or(lines_per_slide)
            .max(1) as usize;
        let chunks = split_lyrics_to_slides(&section.lyrics, section_lines);
        for chunk in chunks {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO lyric_slides (id, song_id, section_id, slide_order, text)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, song_id, section_id, slide_order, chunk],
            )
            .map_err(|e| e.to_string())?;
            slide_order += 1;
        }
    }
    Ok(())
}

/// Split text into stanzas on blank-line boundaries; trims lines, drops empties within a stanza.
fn split_into_stanzas(lyrics: &str) -> Vec<Vec<&str>> {
    let mut stanzas: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for raw_line in lyrics.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            if !current.is_empty() {
                stanzas.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(line);
    }
    if !current.is_empty() {
        stanzas.push(current);
    }
    stanzas
}

/// Distribute `lines` into balanced chunks of at most `lines_per_slide` (avoids orphan single lines).
fn balanced_chunks<'a>(lines: &[&'a str], lines_per_slide: usize) -> Vec<Vec<&'a str>> {
    if lines.len() <= lines_per_slide {
        return vec![lines.to_vec()];
    }
    let chunk_count = lines.len().div_ceil(lines_per_slide);
    let base = lines.len() / chunk_count;
    let mut remainder = lines.len() % chunk_count;

    let mut chunks = Vec::with_capacity(chunk_count);
    let mut index = 0;
    for _ in 0..chunk_count {
        let mut size = base;
        if remainder > 0 {
            size += 1;
            remainder -= 1;
        }
        chunks.push(lines[index..index + size].to_vec());
        index += size;
    }
    chunks
}

/// Stanza-aware slide splitting: respects blank-line breaks, keeps whole stanzas
/// together when they fit, and balances larger stanzas so no slide is left with a
/// lonely orphan line. Mirrors `splitLyricsToSlides` in `src/lib/songTypes.ts`.
pub fn split_lyrics_to_slides(lyrics: &str, lines_per_slide: usize) -> Vec<String> {
    let per_slide = lines_per_slide.max(1);
    let stanzas = split_into_stanzas(lyrics);
    if stanzas.is_empty() {
        return vec![];
    }
    let mut slides = Vec::new();
    for stanza in stanzas {
        for chunk in balanced_chunks(&stanza, per_slide) {
            slides.push(chunk.join("\n"));
        }
    }
    slides
}

/// Section-type keywords used to recognize headers in plain-text lyric files.
const SECTION_KEYWORDS: &str =
    r"intro|verse|pre[-\s]?chorus|chorus|refrain|bridge|tag|outro|ending|instrumental|interlude|vamp|coda";

/// Whole-line bare header, e.g. `Verse 1`, `Chorus (once)`, `Bridge:`, `[Chorus]`.
static BARE_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"(?i)^\s*(?:{SECTION_KEYWORDS})(?:\s*\d+)?\s*(?:\([^)]*\))?\s*:?\s*$"
    ))
    .unwrap()
});

/// A header keyword glued onto the end of a lyric line, e.g. `...all to usOutro:`.
/// Requires the keyword to be welded directly to a word (no space) and end with a colon,
/// which is a strong signal of a corrupted line break rather than a normal lyric.
static GLUED_HEADER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"(?i)^(?P<pre>.+?[\p{{L}}0-9'\u{{2019}},])(?P<kw>{SECTION_KEYWORDS})\s*:\s*$"
    ))
    .unwrap()
});

/// Metadata lines in a file preamble, e.g. `Artist: Loveworld Singers`.
static META_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^\s*(artist|author|by|written by|words and music|ccli|copyright|key|tempo|bpm)\s*:\s*(.+?)\s*$")
        .unwrap()
});

#[derive(Debug, Clone, Default)]
pub struct ParsedSong {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub sections: Vec<SectionInput>,
    /// Section ids in performance order; repeats reference the same section id.
    pub arrangement: Vec<String>,
}

/// If `line` is a section header (bracketed or bare keyword), return its inner text.
fn match_header(line: &str) -> Option<String> {
    if line.starts_with('[') && line.ends_with(']') && line.len() >= 2 {
        return Some(line.trim_matches(['[', ']']).trim().to_string());
    }
    if BARE_HEADER_RE.is_match(line) {
        return Some(line.trim().to_string());
    }
    None
}

/// Detect a header keyword glued onto the end of a lyric line. Returns (lyric_prefix, header).
fn match_glued_header(line: &str) -> Option<(String, String)> {
    let caps = GLUED_HEADER_RE.captures(line)?;
    let pre = caps.name("pre")?.as_str().trim();
    let kw = caps.name("kw")?.as_str().trim();
    if pre.is_empty() {
        return None;
    }
    Some((pre.to_string(), kw.to_string()))
}

/// Turn a raw header into a clean label: strip brackets, parenthetical notes and trailing colon.
fn clean_header_label(header: &str) -> String {
    let mut label = header.trim().trim_matches(['[', ']']).trim().to_string();
    if let Some(open) = label.find('(') {
        label.truncate(open);
    }
    label = label.trim().trim_end_matches(':').trim().to_string();
    label
}

/// Drop leading/trailing blank lines from a section body.
fn trim_blank_edges(lines: &[String]) -> Vec<String> {
    let start = lines.iter().position(|l| !l.trim().is_empty());
    let end = lines.iter().rposition(|l| !l.trim().is_empty());
    match (start, end) {
        (Some(s), Some(e)) => lines[s..=e].to_vec(),
        _ => Vec::new(),
    }
}

/// Flush the accumulated lyric lines into a section, deduplicating identical bodies and
/// recording the (possibly repeated) section id into the arrangement.
#[allow(clippy::too_many_arguments)]
fn flush_parsed_section(
    sections: &mut Vec<SectionInput>,
    arrangement: &mut Vec<String>,
    dedup: &mut std::collections::HashMap<(String, String), String>,
    label: Option<&str>,
    section_type: &str,
    lines: &mut Vec<String>,
    sort: &mut i32,
) {
    let body = trim_blank_edges(lines);
    lines.clear();
    if body.is_empty() && label.is_none() {
        return;
    }
    let lyrics = body.join("\n");
    let key = (
        section_type.to_string(),
        lyrics.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" "),
    );
    if !lyrics.is_empty() {
        if let Some(existing) = dedup.get(&key) {
            arrangement.push(existing.clone());
            return;
        }
    }
    let id = Uuid::new_v4().to_string();
    sections.push(SectionInput {
        id: Some(id.clone()),
        section_type: section_type.to_string(),
        label: label
            .map(str::to_string)
            .unwrap_or_else(|| format!("Section {}", *sort + 1)),
        lyrics,
        sort_order: *sort,
        lines_per_slide: None,
    });
    if !key.1.is_empty() {
        dedup.insert(key, id.clone());
    }
    arrangement.push(id);
    *sort += 1;
}

/// Parse a plain-text lyric file into a structured song: title/artist metadata,
/// deduplicated sections, and an arrangement that repeats reused sections (e.g. choruses).
///
/// Recognizes section headers whether bracketed (`[Chorus]`) or bare (`Chorus`, `Verse 2`,
/// `Chorus (twice)`), and recovers a header keyword that was accidentally glued to the end
/// of a lyric line. Vocal cues like `Choir:` / `Solo:` are kept as lyric text. Blank lines
/// within a section are preserved so the stanza-aware slide splitter can use them.
pub fn parse_song_from_text(raw: &str) -> ParsedSong {
    let has_header = raw.lines().any(|line| match_header(line.trim()).is_some());

    let mut parsed = ParsedSong::default();
    let mut dedup: std::collections::HashMap<(String, String), String> =
        std::collections::HashMap::new();
    let mut current_label: Option<String> = None;
    let mut current_type = "verse".to_string();
    let mut lines: Vec<String> = Vec::new();
    let mut seen_header = false;
    let mut sort = 0;

    for raw_line in raw.lines() {
        let trimmed = raw_line.trim();

        if let Some(header) = match_header(trimmed) {
            flush_parsed_section(
                &mut parsed.sections,
                &mut parsed.arrangement,
                &mut dedup,
                current_label.as_deref(),
                &current_type,
                &mut lines,
                &mut sort,
            );
            seen_header = true;
            current_type = detect_section_type(&header);
            current_label = Some(clean_header_label(&header));
            continue;
        }

        if let Some((pre, kw)) = match_glued_header(trimmed) {
            lines.push(pre);
            flush_parsed_section(
                &mut parsed.sections,
                &mut parsed.arrangement,
                &mut dedup,
                current_label.as_deref(),
                &current_type,
                &mut lines,
                &mut sort,
            );
            seen_header = true;
            current_type = detect_section_type(&kw);
            current_label = Some(clean_header_label(&kw));
            continue;
        }

        // Preamble: pull title/artist out of the lines before the first section header.
        if has_header && !seen_header && lines.is_empty() {
            if trimmed.is_empty() {
                continue;
            }
            if let Some(caps) = META_RE.captures(trimmed) {
                let key = caps.get(1).map(|m| m.as_str().to_lowercase()).unwrap_or_default();
                let value = caps.get(2).map(|m| m.as_str().trim().to_string());
                if matches!(key.as_str(), "artist" | "author" | "by" | "written by" | "words and music")
                {
                    if parsed.artist.is_none() {
                        parsed.artist = value;
                    }
                }
                continue;
            }
            if parsed.title.is_none() {
                parsed.title = Some(trimmed.to_string());
                continue;
            }
            continue;
        }

        if trimmed.is_empty() {
            if !lines.is_empty() {
                lines.push(String::new());
            }
        } else {
            lines.push(trimmed.to_string());
        }
    }

    let final_label = current_label.clone().or_else(|| {
        if parsed.sections.is_empty() {
            Some("Verse 1".to_string())
        } else {
            None
        }
    });
    flush_parsed_section(
        &mut parsed.sections,
        &mut parsed.arrangement,
        &mut dedup,
        final_label.as_deref(),
        &current_type,
        &mut lines,
        &mut sort,
    );

    if parsed.sections.is_empty() && !raw.trim().is_empty() {
        let id = Uuid::new_v4().to_string();
        parsed.sections.push(SectionInput {
            id: Some(id.clone()),
            section_type: "verse".to_string(),
            label: "Verse 1".to_string(),
            lyrics: raw.trim().to_string(),
            sort_order: 0,
            lines_per_slide: None,
        });
        parsed.arrangement.push(id);
    }

    parsed
}

/// Back-compat helper returning only the parsed sections.
pub fn parse_sections_from_text(raw: &str) -> Vec<SectionInput> {
    parse_song_from_text(raw).sections
}

fn detect_section_type(header: &str) -> String {
    let h = header.to_lowercase();
    if h.contains("pre-chorus") || h.contains("prechorus") || h.contains("pre chorus") {
        "pre_chorus".to_string()
    } else if h.contains("chorus") {
        "chorus".to_string()
    } else if h.contains("bridge") {
        "bridge".to_string()
    } else if h.contains("tag") {
        "tag".to_string()
    } else if h.contains("ending") || h.contains("outro") {
        "ending".to_string()
    } else if h.contains("instrumental") || h.contains("interlude") || h.contains("vamp") {
        "instrumental".to_string()
    } else if h.contains("spoken") {
        "spoken".to_string()
    } else if h.contains("intro") {
        "intro".to_string()
    } else {
        "verse".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sections_from_text_preserves_upload_order() {
        let raw = "[Intro]\nintro line\n\n[Chorus 1]\nchorus line\n\n[Verse 1]\nverse line\n";
        let sections = parse_sections_from_text(raw);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].label, "Intro");
        assert_eq!(sections[0].sort_order, 0);
        assert_eq!(sections[1].label, "Chorus 1");
        assert_eq!(sections[1].sort_order, 1);
        assert_eq!(sections[2].label, "Verse 1");
        assert_eq!(sections[2].sort_order, 2);
    }

    #[test]
    fn split_keeps_whole_stanza_when_it_fits() {
        let slides = split_lyrics_to_slides("line one\nline two\nline three", 4);
        assert_eq!(slides, vec!["line one\nline two\nline three".to_string()]);
    }

    #[test]
    fn split_balances_oversized_stanza_without_orphans() {
        // 5 lines @ 4 per slide -> 3 + 2 (not 4 + 1)
        let slides = split_lyrics_to_slides("a\nb\nc\nd\ne", 4);
        assert_eq!(slides, vec!["a\nb\nc".to_string(), "d\ne".to_string()]);
    }

    #[test]
    fn split_respects_blank_line_stanza_breaks() {
        // Two couplets separated by a blank line stay on separate slides.
        let slides = split_lyrics_to_slides("a\nb\n\nc\nd", 4);
        assert_eq!(slides, vec!["a\nb".to_string(), "c\nd".to_string()]);
    }

    #[test]
    fn split_handles_multiple_blank_lines_as_single_break() {
        let slides = split_lyrics_to_slides("a\nb\n\n\n\nc\nd", 4);
        assert_eq!(slides, vec!["a\nb".to_string(), "c\nd".to_string()]);
    }

    #[test]
    fn split_empty_lyrics_returns_no_slides() {
        assert!(split_lyrics_to_slides("\n\n  \n", 4).is_empty());
    }

    const DEAREST_SHEPHERD: &str = "\
 Dearest Shepherd
Artist: Loveworld Singers

Verse 1
Lord, you're our dearest
shepherd
And so we shall not want

Chorus (once)
Lord God, you are with us
We will not be dismayed

Verse 2
We're not afraid of what's
before us
Choir: Every day is a glorious
Solo: The glory we have is not

Chorus (twice)
Lord God, you are with us
We will not be dismayedOutro:

Solo:
All we've known
Is your voice
";

    #[test]
    fn parse_detects_bare_headers_and_types() {
        let parsed = parse_song_from_text(DEAREST_SHEPHERD);
        let labels: Vec<&str> = parsed.sections.iter().map(|s| s.label.as_str()).collect();
        assert_eq!(labels, vec!["Verse 1", "Chorus", "Verse 2", "Outro"]);
        let types: Vec<&str> = parsed
            .sections
            .iter()
            .map(|s| s.section_type.as_str())
            .collect();
        assert_eq!(types, vec!["verse", "chorus", "verse", "ending"]);
    }

    #[test]
    fn parse_extracts_title_and_artist_from_content() {
        let parsed = parse_song_from_text(DEAREST_SHEPHERD);
        assert_eq!(parsed.title.as_deref(), Some("Dearest Shepherd"));
        assert_eq!(parsed.artist.as_deref(), Some("Loveworld Singers"));
    }

    #[test]
    fn parse_dedupes_identical_choruses_and_repeats_in_arrangement() {
        let parsed = parse_song_from_text(DEAREST_SHEPHERD);
        // 4 unique sections, but arrangement has 5 slots (chorus appears twice).
        assert_eq!(parsed.sections.len(), 4);
        assert_eq!(parsed.arrangement.len(), 5);
        let chorus_id = parsed
            .sections
            .iter()
            .find(|s| s.section_type == "chorus")
            .and_then(|s| s.id.clone())
            .unwrap();
        let repeats = parsed
            .arrangement
            .iter()
            .filter(|id| **id == chorus_id)
            .count();
        assert_eq!(repeats, 2);
    }

    #[test]
    fn parse_recovers_glued_outro_header() {
        let parsed = parse_song_from_text(DEAREST_SHEPHERD);
        let outro = parsed
            .sections
            .iter()
            .find(|s| s.section_type == "ending")
            .expect("outro section");
        // The lyric welded to "Outro:" stays with the chorus, not the outro.
        assert!(!outro.lyrics.contains("dismayed"));
        // Vocal cues are kept as lyric text inside the outro.
        assert!(outro.lyrics.contains("Solo:"));
        assert!(outro.lyrics.contains("All we've known"));
    }

    #[test]
    fn parse_keeps_vocal_cues_as_lyrics() {
        let parsed = parse_song_from_text(DEAREST_SHEPHERD);
        let verse2 = &parsed.sections[2];
        assert!(verse2.lyrics.contains("Choir: Every day is a glorious"));
        assert!(verse2.lyrics.contains("Solo: The glory we have is not"));
    }

    #[test]
    fn parse_strips_parenthetical_note_from_chorus_label() {
        let parsed = parse_song_from_text("Chorus (twice)\nsing it loud\n");
        assert_eq!(parsed.sections[0].label, "Chorus");
        assert_eq!(parsed.sections[0].section_type, "chorus");
    }

    #[test]
    fn parse_bracketed_headers_still_work() {
        let parsed = parse_song_from_text("[Pre-Chorus]\nlift him up\n");
        assert_eq!(parsed.sections[0].label, "Pre-Chorus");
        assert_eq!(parsed.sections[0].section_type, "pre_chorus");
    }

    #[test]
    fn parse_unstructured_text_does_not_steal_title() {
        // No headers anywhere: keep everything as a single verse, no title theft.
        let parsed = parse_song_from_text("just a line\nanother line\n");
        assert_eq!(parsed.title, None);
        assert_eq!(parsed.sections.len(), 1);
        assert_eq!(parsed.sections[0].section_type, "verse");
    }

    #[test]
    fn resolve_arrangement_order_keeps_client_added_sections() {
        let old_id_to_sort = std::collections::HashMap::from([
            ("verse-db-id".to_string(), 0),
            ("chorus-db-id".to_string(), 1),
        ]);
        let intro_id = "intro-client-id".to_string();
        let sections = vec![
            SectionInput {
                id: Some("verse-db-id".to_string()),
                section_type: "verse".to_string(),
                label: "Verse 1".to_string(),
                lyrics: "line".to_string(),
                sort_order: 0,
                lines_per_slide: None,
            },
            SectionInput {
                id: Some("chorus-db-id".to_string()),
                section_type: "chorus".to_string(),
                label: "Chorus".to_string(),
                lyrics: "hook".to_string(),
                sort_order: 1,
                lines_per_slide: None,
            },
            SectionInput {
                id: Some(intro_id.clone()),
                section_type: "intro".to_string(),
                label: "Intro".to_string(),
                lyrics: "intro".to_string(),
                sort_order: 2,
                lines_per_slide: None,
            },
        ];
        let new_ids = vec![
            "verse-db-id".to_string(),
            "chorus-db-id".to_string(),
            intro_id.clone(),
        ];
        let arr_order = vec![
            intro_id.clone(),
            "verse-db-id".to_string(),
            "chorus-db-id".to_string(),
        ];

        let resolved = resolve_arrangement_order(Some(&arr_order), &old_id_to_sort, &sections, &new_ids);
        assert_eq!(resolved, arr_order);
    }
}
