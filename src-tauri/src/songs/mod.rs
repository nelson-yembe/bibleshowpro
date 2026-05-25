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
    if detail.slides.is_empty() && has_lyrics {
        let order = arrangement_section_ids(conn, id, &detail)?;
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
    let sections = parse_sections_from_text(&raw_text);
    let duplicate_of = find_duplicate_title(conn, &title)?;
    let input = CreateSongInput {
        title,
        artist,
        default_key: None,
        bpm: None,
        tags_json,
        operator_notes: None,
        theme_json: None,
        sections,
        arrangement: None,
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
        section_order = Some(new_ids.clone());

        let remapped_order = if let Some(arr_order) = &input.arrangement_section_ids {
            remap_arrangement_order(arr_order, &old_id_to_sort, sections, &new_ids)
        } else {
            new_ids.clone()
        };

        update_default_arrangement(conn, &input.id, &remapped_order, input.arrangement_name.as_deref())?;
        section_order = Some(remapped_order);
    } else if let Some(order) = &input.arrangement_section_ids {
        update_default_arrangement(conn, &input.id, order, input.arrangement_name.as_deref())?;
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

fn arrangement_section_ids(_conn: &Connection, _song_id: &str, detail: &SongDetail) -> Result<Vec<String>, String> {
    if let Some(arr) = detail.arrangements.iter().find(|a| a.is_default) {
        let parsed: Vec<String> = serde_json::from_str(&arr.section_order_json).unwrap_or_default();
        let valid: Vec<String> = parsed
            .into_iter()
            .filter(|id| detail.sections.iter().any(|s| s.id == *id))
            .collect();
        if !valid.is_empty() {
            return Ok(valid);
        }
    }
    Ok(detail.sections.iter().map(|s| s.id.clone()).collect())
}

fn remap_arrangement_order(
    arr_order: &[String],
    old_id_to_sort: &std::collections::HashMap<String, i32>,
    sections: &[SectionInput],
    new_ids: &[String],
) -> Vec<String> {
    let remapped: Vec<String> = arr_order
        .iter()
        .filter_map(|old_id| {
            let sort = *old_id_to_sort.get(old_id)?;
            let idx = sections.iter().position(|s| s.sort_order == sort)?;
            new_ids.get(idx).cloned()
        })
        .collect();
    if remapped.is_empty() {
        new_ids.to_vec()
    } else {
        remapped
    }
}

fn insert_sections(conn: &Connection, song_id: &str, sections: &[SectionInput]) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for section in sections {
        let id = Uuid::new_v4().to_string();
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

pub fn split_lyrics_to_slides(lyrics: &str, lines_per_slide: usize) -> Vec<String> {
    let lines: Vec<&str> = lyrics
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    if lines.is_empty() {
        return vec![];
    }
    let mut slides = Vec::new();
    let mut chunk = Vec::new();
    for line in lines {
        chunk.push(line);
        if chunk.len() >= lines_per_slide {
            slides.push(chunk.join("\n"));
            chunk = Vec::new();
        }
    }
    if !chunk.is_empty() {
        slides.push(chunk.join("\n"));
    }
    slides
}

pub fn parse_sections_from_text(raw: &str) -> Vec<SectionInput> {
    let mut sections = Vec::new();
    let mut current_label: Option<String> = None;
    let mut current_type = "verse".to_string();
    let mut lines: Vec<String> = Vec::new();
    let mut sort = 0;

    let flush = |sections: &mut Vec<SectionInput>, label: &str, section_type: &str, lines: &mut Vec<String>, sort: &mut i32| {
        if lines.is_empty() && label.is_empty() {
            return;
        }
        sections.push(SectionInput {
            section_type: section_type.to_string(),
            label: if label.is_empty() { format!("Section {}", *sort + 1) } else { label.to_string() },
            lyrics: lines.join("\n"),
            sort_order: *sort,
            lines_per_slide: None,
        });
        *sort += 1;
        lines.clear();
    };

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if current_label.is_some() || !lines.is_empty() {
                flush(
                    &mut sections,
                    current_label.as_deref().unwrap_or(""),
                    &current_type,
                    &mut lines,
                    &mut sort,
                );
            }
            let header = trimmed.trim_matches(['[', ']']).trim();
            current_type = detect_section_type(header);
            current_label = Some(header.to_string());
            continue;
        }
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
    }
    flush(
        &mut sections,
        current_label.as_deref().unwrap_or("Verse 1"),
        &current_type,
        &mut lines,
        &mut sort,
    );

    if sections.is_empty() && !raw.trim().is_empty() {
        sections.push(SectionInput {
            section_type: "verse".to_string(),
            label: "Verse 1".to_string(),
            lyrics: raw.trim().to_string(),
            sort_order: 0,
            lines_per_slide: None,
        });
    }
    sections
}

fn detect_section_type(header: &str) -> String {
    let h = header.to_lowercase();
    if h.contains("chorus") {
        "chorus".to_string()
    } else if h.contains("bridge") {
        "bridge".to_string()
    } else if h.contains("tag") {
        "tag".to_string()
    } else if h.contains("ending") || h.contains("outro") {
        "ending".to_string()
    } else if h.contains("instrumental") {
        "instrumental".to_string()
    } else if h.contains("spoken") {
        "spoken".to_string()
    } else if h.contains("pre-chorus") || h.contains("prechorus") {
        "pre_chorus".to_string()
    } else if h.contains("intro") {
        "intro".to_string()
    } else {
        "verse".to_string()
    }
}
