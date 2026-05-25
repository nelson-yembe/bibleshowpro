use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServicePlanSummary {
    pub id: String,
    pub title: String,
    pub service_date: Option<String>,
    pub is_template: bool,
    pub updated_at: String,
    pub item_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceItem {
    pub id: String,
    pub service_plan_id: String,
    pub item_type: String,
    pub title: String,
    pub content_json: String,
    pub operator_notes: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServicePlanDetail {
    pub id: String,
    pub title: String,
    pub service_date: Option<String>,
    pub notes: Option<String>,
    pub theme_id: Option<String>,
    pub is_template: bool,
    pub items: Vec<ServiceItem>,
}

pub fn list_plans(conn: &Connection) -> Result<Vec<ServicePlanSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT sp.id, sp.title, sp.service_date, sp.is_template, sp.updated_at,
                    (SELECT COUNT(*) FROM service_items si WHERE si.service_plan_id = sp.id) as item_count
             FROM service_plans sp
             ORDER BY sp.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ServicePlanSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                service_date: row.get(2)?,
                is_template: row.get::<_, i32>(3)? == 1,
                updated_at: row.get(4)?,
                item_count: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_plan(conn: &Connection, id: &str) -> Result<ServicePlanDetail, String> {
    let plan = conn
        .query_row(
            "SELECT id, title, service_date, notes, theme_id, is_template FROM service_plans WHERE id = ?1",
            params![id],
            |row| {
                Ok(ServicePlanDetail {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    service_date: row.get(2)?,
                    notes: row.get(3)?,
                    theme_id: row.get(4)?,
                    is_template: row.get::<_, i32>(5)? == 1,
                    items: vec![],
                })
            },
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, service_plan_id, item_type, title, content_json, operator_notes, sort_order
             FROM service_items WHERE service_plan_id = ?1 ORDER BY sort_order",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map(params![id], |row| {
            Ok(ServiceItem {
                id: row.get(0)?,
                service_plan_id: row.get(1)?,
                item_type: row.get(2)?,
                title: row.get(3)?,
                content_json: row.get(4)?,
                operator_notes: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ServicePlanDetail { items, ..plan })
}

pub fn create_plan(conn: &Connection, title: &str, is_template: bool) -> Result<ServicePlanDetail, String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO service_plans (id, title, is_template) VALUES (?1, ?2, ?3)",
        params![id, title, if is_template { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;
    get_plan(conn, &id)
}

pub fn update_plan(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    service_date: Option<&str>,
    notes: Option<&str>,
    theme_id: Option<&str>,
) -> Result<ServicePlanDetail, String> {
    if let Some(t) = title {
        conn.execute(
            "UPDATE service_plans SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![t, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if service_date.is_some() || notes.is_some() || theme_id.is_some() {
        conn.execute(
            "UPDATE service_plans SET service_date = COALESCE(?1, service_date), notes = COALESCE(?2, notes),
             theme_id = COALESCE(?3, theme_id), updated_at = datetime('now') WHERE id = ?4",
            params![service_date, notes, theme_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    get_plan(conn, id)
}

pub fn delete_plan(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM service_plans WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn duplicate_plan(conn: &Connection, id: &str) -> Result<ServicePlanDetail, String> {
    let source = get_plan(conn, id)?;
    let new_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO service_plans (id, title, service_date, notes, theme_id, is_template)
         SELECT ?1, title || ' (Copy)', service_date, notes, theme_id, is_template FROM service_plans WHERE id = ?2",
        params![new_id, id],
    )
    .map_err(|e| e.to_string())?;

    for item in source.items {
        let item_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO service_items (id, service_plan_id, item_type, title, content_json, operator_notes, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                item_id,
                new_id,
                item.item_type,
                item.title,
                item.content_json,
                item.operator_notes,
                item.sort_order
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    get_plan(conn, &new_id)
}

pub fn create_item(
    conn: &Connection,
    plan_id: &str,
    item_type: &str,
    title: &str,
    content_json: &str,
    operator_notes: Option<&str>,
) -> Result<ServiceItem, String> {
    let id = Uuid::new_v4().to_string();
    let sort_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM service_items WHERE service_plan_id = ?1",
            params![plan_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO service_items (id, service_plan_id, item_type, title, content_json, operator_notes, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, plan_id, item_type, title, content_json, operator_notes, sort_order],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE service_plans SET updated_at = datetime('now') WHERE id = ?1",
        params![plan_id],
    )
    .map_err(|e| e.to_string())?;

    get_item(conn, &id)
}

pub fn get_item(conn: &Connection, id: &str) -> Result<ServiceItem, String> {
    conn.query_row(
        "SELECT id, service_plan_id, item_type, title, content_json, operator_notes, sort_order
         FROM service_items WHERE id = ?1",
        params![id],
        |row| {
            Ok(ServiceItem {
                id: row.get(0)?,
                service_plan_id: row.get(1)?,
                item_type: row.get(2)?,
                title: row.get(3)?,
                content_json: row.get(4)?,
                operator_notes: row.get(5)?,
                sort_order: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn update_item(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    content_json: Option<&str>,
    operator_notes: Option<&str>,
) -> Result<ServiceItem, String> {
    conn.execute(
        "UPDATE service_items SET
            title = COALESCE(?1, title),
            content_json = COALESCE(?2, content_json),
            operator_notes = COALESCE(?3, operator_notes),
            updated_at = datetime('now')
         WHERE id = ?4",
        params![title, content_json, operator_notes, id],
    )
    .map_err(|e| e.to_string())?;

    let plan_id: String = conn
        .query_row(
            "SELECT service_plan_id FROM service_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE service_plans SET updated_at = datetime('now') WHERE id = ?1",
        params![plan_id],
    )
    .map_err(|e| e.to_string())?;

    get_item(conn, id)
}

pub fn delete_item(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM service_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reorder_items(conn: &Connection, plan_id: &str, item_ids: &[String]) -> Result<(), String> {
    for (index, item_id) in item_ids.iter().enumerate() {
        conn.execute(
            "UPDATE service_items SET sort_order = ?1, updated_at = datetime('now') WHERE id = ?2 AND service_plan_id = ?3",
            params![index as i32, item_id, plan_id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE service_plans SET updated_at = datetime('now') WHERE id = ?1",
        params![plan_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_scripture_list(conn: &Connection, plan_id: &str, text: &str) -> Result<Vec<ServiceItem>, String> {
    let mut created = vec![];
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let item = create_item(
            conn,
            plan_id,
            "scripture",
            trimmed,
            &serde_json::json!({ "reference": trimmed }).to_string(),
            None,
        )?;
        created.push(item);
    }
    Ok(created)
}

pub fn export_plan_json(conn: &Connection, id: &str) -> Result<String, String> {
    let plan = get_plan(conn, id)?;
    serde_json::to_string_pretty(&plan).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeRecord {
    pub id: String,
    pub name: String,
    pub config_json: String,
    pub is_default: bool,
}

pub fn list_themes(conn: &Connection) -> Result<Vec<ThemeRecord>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, config_json, is_default FROM themes ORDER BY is_default DESC, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ThemeRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                config_json: row.get(2)?,
                is_default: row.get::<_, i32>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn save_theme(conn: &Connection, id: Option<&str>, name: &str, config_json: &str, is_default: bool) -> Result<ThemeRecord, String> {
    let theme_id = id.map(|s| s.to_string()).unwrap_or_else(|| Uuid::new_v4().to_string());

    if is_default {
        conn.execute("UPDATE themes SET is_default = 0", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO themes (id, name, config_json, is_default) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, config_json = excluded.config_json,
         is_default = excluded.is_default, updated_at = datetime('now')",
        params![theme_id, name, config_json, if is_default { 1 } else { 0 }],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, config_json, is_default FROM themes WHERE id = ?1",
        params![theme_id],
        |row| {
            Ok(ThemeRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                config_json: row.get(2)?,
                is_default: row.get::<_, i32>(3)? == 1,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn delete_theme(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM themes WHERE id = ?1 AND is_default = 0", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRecord {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub media_type: String,
    pub tags_json: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub file_exists: bool,
}

fn detect_media_type(ext: &str) -> Result<&'static str, String> {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" => Ok("image"),
        "mp4" | "webm" | "mov" | "mkv" | "avi" | "m4v" => Ok("video"),
        "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" => Ok("audio"),
        _ => Err(format!("Unsupported file type: .{ext}")),
    }
}

fn map_media_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MediaRecord> {
    let file_path: String = row.get(2)?;
    Ok(MediaRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        file_path: file_path.clone(),
        media_type: row.get(3)?,
        tags_json: row.get(4)?,
        thumbnail_path: row.get(5)?,
        created_at: row.get(6)?,
        file_exists: std::path::Path::new(&file_path).exists(),
    })
}

pub fn list_media(conn: &Connection) -> Result<Vec<MediaRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, file_path, media_type, tags_json, thumbnail_path, created_at
             FROM media_assets ORDER BY created_at DESC, name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_media_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn import_media_files(
    conn: &Connection,
    source_paths: &[String],
    app_data_dir: &std::path::Path,
) -> Result<Vec<MediaRecord>, String> {
    let media_dir = app_data_dir.join("media");
    std::fs::create_dir_all(&media_dir).map_err(|e| e.to_string())?;

    let mut imported = Vec::new();
    for source_path in source_paths {
        let source = std::path::Path::new(source_path);
        if !source.exists() {
            return Err(format!("File not found: {source_path}"));
        }

        let ext = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        let media_type = detect_media_type(&ext)?;

        let id = Uuid::new_v4().to_string();
        let dest_name = if ext.is_empty() {
            id.clone()
        } else {
            format!("{id}.{ext}")
        };
        let dest = media_dir.join(&dest_name);
        std::fs::copy(source, &dest).map_err(|e| format!("Failed to copy {source_path}: {e}"))?;

        let name = source
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Untitled".to_string());

        let dest_string = dest.to_string_lossy().to_string();
        let thumbnail_path = if media_type == "image" {
            Some(dest_string.clone())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO media_assets (id, name, file_path, media_type, thumbnail_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, dest_string, media_type, thumbnail_path],
        )
        .map_err(|e| e.to_string())?;

        imported.push(get_media_by_id(conn, &id)?);
    }

    Ok(imported)
}

fn get_media_by_id(conn: &Connection, id: &str) -> Result<MediaRecord, String> {
    conn.query_row(
        "SELECT id, name, file_path, media_type, tags_json, thumbnail_path, created_at
         FROM media_assets WHERE id = ?1",
        params![id],
        map_media_row,
    )
    .map_err(|e| e.to_string())
}

pub fn add_media(conn: &Connection, name: &str, file_path: &str, media_type: &str) -> Result<MediaRecord, String> {
    let id = Uuid::new_v4().to_string();
    let thumbnail_path = if media_type == "image" {
        Some(file_path.to_string())
    } else {
        None
    };
    conn.execute(
        "INSERT INTO media_assets (id, name, file_path, media_type, thumbnail_path) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, file_path, media_type, thumbnail_path],
    )
    .map_err(|e| e.to_string())?;

    get_media_by_id(conn, &id)
}

pub fn update_media(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    tags_json: Option<&str>,
) -> Result<MediaRecord, String> {
    if let Some(value) = name {
        conn.execute(
            "UPDATE media_assets SET name = ?1 WHERE id = ?2",
            params![value, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(value) = tags_json {
        conn.execute(
            "UPDATE media_assets SET tags_json = ?1 WHERE id = ?2",
            params![value, id],
        )
        .map_err(|e| e.to_string())?;
    }
    get_media_by_id(conn, id)
}

pub fn delete_media(conn: &Connection, id: &str, app_data_dir: &std::path::Path) -> Result<(), String> {
    let record = get_media_by_id(conn, id)?;
    let media_root = app_data_dir.join("media");
    let file_path = std::path::Path::new(&record.file_path);
    if file_path.starts_with(&media_root) && file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    conn.execute("DELETE FROM media_assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_presentation_state(conn: &Connection, state_json: &str, plan_id: Option<&str>) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO presentation_sessions (id, service_plan_id, state_json) VALUES (?1, ?2, ?3)",
        params![id, plan_id, state_json],
    )
    .map_err(|e| e.to_string())?;
    crate::db::set_setting(conn, "last_presentation_state", state_json)?;
    Ok(id)
}

pub fn load_presentation_state(conn: &Connection) -> Result<Option<String>, String> {
    crate::db::get_setting(conn, "last_presentation_state")
}

pub fn create_backup(conn: &Connection) -> Result<String, String> {
    let plans = list_plans(conn)?;
    let mut full_plans = vec![];
    for p in plans {
        full_plans.push(get_plan(conn, &p.id)?);
    }
    let themes = list_themes(conn)?;
    let media = list_media(conn)?;

    let backup = serde_json::json!({
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "service_plans": full_plans,
        "themes": themes,
        "media": media,
    });

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

pub fn restore_backup(conn: &Connection, json: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;

    if let Some(plans) = value.get("service_plans").and_then(|p| p.as_array()) {
        for plan in plans {
            let id = plan.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let title = plan.get("title").and_then(|v| v.as_str()).unwrap_or("Restored Plan");
            conn.execute(
                "INSERT OR REPLACE INTO service_plans (id, title, service_date, notes, theme_id, is_template)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    title,
                    plan.get("service_date").and_then(|v| v.as_str()),
                    plan.get("notes").and_then(|v| v.as_str()),
                    plan.get("theme_id").and_then(|v| v.as_str()),
                    plan.get("is_template").and_then(|v| v.as_bool()).unwrap_or(false) as i32
                ],
            )
            .map_err(|e| e.to_string())?;

            if let Some(items) = plan.get("items").and_then(|v| v.as_array()) {
                conn.execute("DELETE FROM service_items WHERE service_plan_id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
                for item in items {
                    conn.execute(
                        "INSERT INTO service_items (id, service_plan_id, item_type, title, content_json, operator_notes, sort_order)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            item.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                            id,
                            item.get("item_type").and_then(|v| v.as_str()).unwrap_or("scripture"),
                            item.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                            item.get("content_json").and_then(|v| v.as_str()).unwrap_or("{}"),
                            item.get("operator_notes").and_then(|v| v.as_str()),
                            item.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(0) as i32
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(())
}

pub fn get_translation(conn: &Connection, id: &str) -> Result<Option<(String, String)>, String> {
    conn.query_row(
        "SELECT id, abbreviation FROM bible_translations WHERE id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}
