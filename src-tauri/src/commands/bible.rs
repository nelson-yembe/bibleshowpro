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

/// The translation the operator chose as default, from the database (not the catalog).
fn default_translation_id(conn: &Connection) -> Option<String> {
    conn.query_row("SELECT id FROM bible_translations WHERE is_default = 1 LIMIT 1", [], |row| row.get(0))
        .ok()
}

fn catalog_view(conn: &Connection, entry: CatalogEntry, default_id: Option<&str>) -> Result<CatalogEntryView, String> {
    let verse_count = verse_count_for_translation(conn, &entry.id).unwrap_or(0);
    let is_default = default_id.map_or(entry.is_default, |id| id == entry.id);
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
        is_default,
        install_method: entry.install_method,
        installed: verse_count >= FULL_BIBLE_MIN_VERSES,
        verse_count,
    })
}

/// Translations imported under their own id (a JSON, Zefania, OSIS or USFM file), which the
/// built-in catalog does not know. Any verse makes one usable: a New Testament or a
/// translation still in progress is complete as imported.
fn imported_views(conn: &Connection, known: &[String], default_id: Option<&str>) -> Result<Vec<CatalogEntryView>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name, t.abbreviation, t.language, COALESCE(t.copyright, ''),
                    (SELECT COUNT(*) FROM bible_verses v WHERE v.translation_id = t.id)
             FROM bible_translations t
             ORDER BY t.abbreviation",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut views = Vec::new();
    for row in rows {
        let (id, name, abbreviation, language, copyright, verse_count) = row.map_err(|e| e.to_string())?;
        if known.contains(&id) || verse_count == 0 {
            continue;
        }
        views.push(CatalogEntryView {
            is_default: default_id == Some(id.as_str()),
            id,
            name,
            abbreviation,
            language,
            copyright,
            license: String::new(),
            source_format: String::new(),
            download_url: None,
            size_bytes: None,
            install_method: "imported".to_string(),
            installed: true,
            verse_count,
        });
    }
    Ok(views)
}

#[tauri::command]
pub fn get_bible_catalog(state: State<AppState>) -> Result<Vec<CatalogEntryView>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(catalog_with_imports)
}

/// The built-in catalog, then every translation imported under an id of its own.
fn catalog_with_imports(conn: &Connection) -> Result<Vec<CatalogEntryView>, String> {
    let default_id = default_translation_id(conn);
    let catalog = load_catalog()?;
    let known: Vec<String> = catalog.iter().map(|entry| entry.id.clone()).collect();
    let mut views = catalog
        .into_iter()
        .map(|entry| catalog_view(conn, entry, default_id.as_deref()))
        .collect::<Result<Vec<_>, _>>()?;
    views.extend(imported_views(conn, &known, default_id.as_deref())?);
    Ok(views)
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

fn installed_translation_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM bible_translations")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

/// Read Zefania, OSIS, OpenSong or USFM files and say what they hold, without importing.
#[tauri::command]
pub fn preview_bible_files(
    state: State<AppState>,
    files: Vec<String>,
    file_name: Option<String>,
) -> Result<crate::bible::open_formats::OpenBiblePreview, String> {
    let parsed = crate::bible::open_formats::parse_files(&files)?;
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    let existing = db.with_conn(installed_translation_ids)?;
    Ok(crate::bible::open_formats::preview(&parsed, &existing, file_name.as_deref()))
}

#[tauri::command]
pub fn import_bible_files(
    state: State<AppState>,
    files: Vec<String>,
    meta: crate::bible::open_formats::BibleMeta,
    set_default: Option<bool>,
) -> Result<ImportResult, String> {
    let parsed = crate::bible::open_formats::parse_files(&files)?;
    let payload = crate::bible::open_formats::to_payload(parsed, &meta)?;
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    let stats = db.with_conn(|conn| import_payload(conn, &payload, set_default.unwrap_or(false)))?;
    Ok(ImportResult {
        translation_id: stats.translation_id,
        abbreviation: stats.abbreviation.clone(),
        verse_count: stats.verse_count,
        message: format!("Imported {} ({} verses)", stats.abbreviation, stats.verse_count),
    })
}

/// Scripture references written in a sermon notes file (.docx, .pdf, .txt, .md).
#[tauri::command]
pub async fn read_sermon_notes(path: String) -> Result<Vec<crate::bible::notes::NotesReference>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("Could not open {path}: {e}"))?;
        let text = crate::bible::notes::document_text(&path, &bytes)?;
        Ok(crate::bible::notes::find_references(&text))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Verses of `book_number` `chapter` that were just read or paraphrased, best first.
#[tauri::command]
pub fn match_passage_reading(
    state: State<AppState>,
    heard: String,
    book_number: i32,
    chapter: i32,
) -> Result<Vec<crate::bible::reading::ReadingMatch>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::bible::reading::match_reading(conn, &heard, book_number, chapter))
}

/// Scripture references in notes pasted as text.
#[tauri::command]
pub fn find_sermon_references(text: String) -> Vec<crate::bible::notes::NotesReference> {
    crate::bible::notes::find_references(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE bible_translations (id TEXT PRIMARY KEY, name TEXT, abbreviation TEXT, language TEXT, copyright TEXT, is_default INTEGER);
             CREATE TABLE bible_verses (translation_id TEXT, book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
             INSERT INTO bible_translations VALUES
               ('kjv', 'King James Version', 'KJV', 'en', 'Public Domain', 0),
               ('tpt2025', 'The Passion Translation (2025)', 'TPT', 'en', 'Passion & Fire Ministries', 1),
               ('tlb1971', 'The Living Bible (1971)', 'TLB', 'en', NULL, 0),
               ('empty', 'Failed import', 'EMP', 'en', '', 0);
             INSERT INTO bible_verses VALUES ('kjv', 43, 3, 16, 'For God so loved'), ('tpt2025', 43, 3, 16, 'For here is'), ('tlb1971', 43, 3, 16, 'For God loved');",
        )
        .unwrap();
        conn
    }

    #[test]
    fn lists_translations_imported_under_their_own_id() {
        let views = catalog_with_imports(&library()).unwrap();
        let imported: Vec<&str> = views.iter().filter(|v| v.install_method == "imported").map(|v| v.abbreviation.as_str()).collect();
        // A translation with no verses was not really imported; the catalog's own ids are not repeated.
        assert_eq!(imported, vec!["TLB", "TPT"]);
        let tpt = views.iter().find(|v| v.id == "tpt2025").unwrap();
        assert!(tpt.installed, "a partial Bible imported from a file is usable");
        assert_eq!(tpt.copyright, "Passion & Fire Ministries");
        assert_eq!(views.iter().find(|v| v.id == "tlb1971").unwrap().copyright, "");
    }

    /// Against the app's real database: `BSP_DB_FILE=<path to bible-show-pro.db> cargo test catalog`.
    #[test]
    fn every_installed_translation_is_listed_once() {
        let Ok(path) = std::env::var("BSP_DB_FILE") else { return };
        let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let views = catalog_with_imports(&conn).unwrap();
        let mut stmt = conn
            .prepare("SELECT t.id FROM bible_translations t WHERE EXISTS (SELECT 1 FROM bible_verses v WHERE v.translation_id = t.id)")
            .unwrap();
        let ids: Vec<String> = stmt.query_map([], |row| row.get(0)).unwrap().map(Result::unwrap).collect();
        for id in &ids {
            let listed: Vec<&CatalogEntryView> = views.iter().filter(|v| &v.id == id).collect();
            assert_eq!(listed.len(), 1, "{id} must be listed once");
            let v = listed[0];
            println!("{:8} {:>6} verses  {:9} installed={}", v.abbreviation, v.verse_count, v.install_method, v.installed);
        }
    }

    #[test]
    fn the_default_comes_from_the_database() {
        let views = catalog_with_imports(&library()).unwrap();
        let defaults: Vec<&str> = views.iter().filter(|v| v.is_default).map(|v| v.id.as_str()).collect();
        assert_eq!(defaults, vec!["tpt2025"]);
    }
}
