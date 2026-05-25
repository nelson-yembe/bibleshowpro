use crate::bible::catalog::{find_catalog_entry, load_catalog, CatalogEntry};
use crate::bible::import::{
    delete_translation, import_payload, set_default_translation, verse_count_for_translation,
    ImportPayload, ImportStats,
};
use crate::bible::install::{
    ensure_core_packages, fetch_catalog_payload, needs_full_bible, FULL_BIBLE_MIN_VERSES,
};
use crate::db::lock_db;
use crate::AppState;
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
pub struct ImportProgressEvent {
    pub translation_id: String,
    pub phase: String,
    pub current: i32,
    pub total: i32,
    pub message: String,
}

#[derive(Serialize)]
pub struct CatalogEntryView {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub copyright: String,
    pub license: String,
    pub source_format: String,
    pub download_url: Option<String>,
    pub size_bytes: Option<i64>,
    pub is_default: bool,
    pub install_method: String,
    pub installed: bool,
    pub verse_count: i64,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub translation_id: String,
    pub abbreviation: String,
    pub verse_count: usize,
    pub message: String,
}

fn emit_progress(app: &AppHandle, event: ImportProgressEvent) {
    let _ = app.emit("bible-import-progress", event);
}

fn catalog_view(conn: &Connection, entry: CatalogEntry) -> Result<CatalogEntryView, String> {
    let verse_count = verse_count_for_translation(conn, &entry.id).unwrap_or(0);
    Ok(CatalogEntryView {
        id: entry.id,
        name: entry.name,
        abbreviation: entry.abbreviation,
        language: entry.language,
        copyright: entry.copyright,
        license: entry.license,
        source_format: entry.source_format,
        download_url: entry.download_url,
        size_bytes: entry.size_bytes,
        is_default: entry.is_default,
        install_method: entry.install_method,
        installed: verse_count >= FULL_BIBLE_MIN_VERSES,
        verse_count,
    })
}

#[tauri::command]
pub fn get_bible_catalog(state: State<AppState>) -> Result<Vec<CatalogEntryView>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        load_catalog()?
            .into_iter()
            .map(|entry| catalog_view(conn, entry))
            .collect()
    })
}

#[tauri::command]
pub fn delete_bible_translation(state: State<AppState>, translation_id: String) -> Result<(), String> {
    if translation_id == "kjv" {
        return Err("Cannot remove the default King James Version.".to_string());
    }
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| delete_translation(conn, &translation_id))
}

#[tauri::command]
pub fn set_default_bible_translation(
    state: State<AppState>,
    translation_id: String,
) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| set_default_translation(conn, &translation_id))
}

#[tauri::command]
pub fn get_bible_setup_status(state: State<AppState>) -> Result<BibleSetupStatus, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let kjv_count = verse_count_for_translation(conn, "kjv").unwrap_or(0);
        Ok(BibleSetupStatus {
            kjv_verse_count: kjv_count,
            needs_full_bible: needs_full_bible(conn, "kjv").unwrap_or(true),
        })
    })
}

#[derive(Serialize)]
pub struct BibleSetupStatus {
    pub kjv_verse_count: i64,
    pub needs_full_bible: bool,
}

fn import_from_catalog_payload(
    conn: &Connection,
    entry: &CatalogEntry,
    payload: &ImportPayload,
) -> Result<ImportStats, String> {
    import_payload(conn, payload, entry.is_default)
}

#[tauri::command]
pub async fn install_core_bible_packages(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ImportResult>, String> {
    let db_path = {
        let guard = state.db.lock().map_err(|e| e.to_string())?;
        guard.path.clone()
    };

    let app_handle = app.clone();
    let results = ensure_core_packages(&db_path, Some(Box::new(move |msg| {
        let _ = app_handle.emit(
            "bible-import-progress",
            ImportProgressEvent {
                translation_id: "core".to_string(),
                phase: "install".to_string(),
                current: 0,
                total: 1,
                message: msg.to_string(),
            },
        );
    })))
    .await?;

    Ok(results
        .into_iter()
        .map(|stats| ImportResult {
            translation_id: stats.translation_id.clone(),
            abbreviation: stats.abbreviation.clone(),
            verse_count: stats.verse_count,
            message: format!("Installed {} ({} verses)", stats.abbreviation, stats.verse_count),
        })
        .collect())
}

#[tauri::command]
pub async fn download_bible_translation(
    app: AppHandle,
    state: State<'_, AppState>,
    translation_id: String,
) -> Result<ImportResult, String> {
    let entry = find_catalog_entry(&translation_id)?;
    if entry.install_method != "download" {
        return Err(format!(
            "{} must be imported from a licensed JSON file.",
            entry.abbreviation
        ));
    }

    emit_progress(
        &app,
        ImportProgressEvent {
            translation_id: translation_id.clone(),
            phase: "download".to_string(),
            current: 0,
            total: 1,
            message: format!("Downloading {}...", entry.name),
        },
    );

    let payload = fetch_catalog_payload(&entry, None).await?;

    emit_progress(
        &app,
        ImportProgressEvent {
            translation_id: translation_id.clone(),
            phase: "import".to_string(),
            current: 1,
            total: 1,
            message: format!("Importing {}...", entry.abbreviation),
        },
    );

    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    let stats = db.with_conn(|conn| import_from_catalog_payload(conn, &entry, &payload))?;

    emit_progress(
        &app,
        ImportProgressEvent {
            translation_id: translation_id.clone(),
            phase: "done".to_string(),
            current: 1,
            total: 1,
            message: format!("{} ready ({} verses)", stats.abbreviation, stats.verse_count),
        },
    );

    Ok(ImportResult {
        translation_id: stats.translation_id,
        abbreviation: stats.abbreviation.clone(),
        verse_count: stats.verse_count,
        message: format!("Installed {} ({} verses)", stats.abbreviation, stats.verse_count),
    })
}

#[tauri::command]
pub fn import_bible_json(
    state: State<AppState>,
    json: String,
    set_default: Option<bool>,
) -> Result<ImportResult, String> {
    let payload: ImportPayload = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    let stats = db.with_conn(|conn| import_payload(conn, &payload, set_default.unwrap_or(false)))?;
    Ok(ImportResult {
        translation_id: stats.translation_id,
        abbreviation: stats.abbreviation.clone(),
        verse_count: stats.verse_count,
        message: format!("Imported {} ({} verses)", stats.abbreviation, stats.verse_count),
    })
}
