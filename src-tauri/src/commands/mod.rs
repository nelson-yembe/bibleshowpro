use crate::bible::search::{lookup_reference as bible_lookup, split_passage, SearchResult, VerseResult};
use crate::bible::SearchOptions;
use crate::db::lock_db;
use crate::service;
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

pub mod bible;
pub mod songs;
pub mod ndi;
pub mod transcription;

#[derive(Serialize)]
pub struct InitResponse {
    pub initialized: bool,
    pub translation_count: i64,
}

#[tauri::command]
pub fn init_app(state: State<AppState>) -> Result<InitResponse, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bible_translations", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(InitResponse {
            initialized: count > 0,
            translation_count: count,
        })
    })
}

#[derive(Serialize)]
pub struct TranslationInfo {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn get_translations(state: State<AppState>) -> Result<Vec<TranslationInfo>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, name, abbreviation, language, is_default FROM bible_translations ORDER BY is_default DESC, name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(TranslationInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    abbreviation: row.get(2)?,
                    language: row.get(3)?,
                    is_default: row.get::<_, i32>(4)? == 1,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn search_bible(
    state: State<AppState>,
    query: String,
    translation_id: Option<String>,
    search_options: Option<SearchOptions>,
) -> Result<SearchResult, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        bible_lookup(
            conn,
            &query,
            translation_id.as_deref(),
            search_options.as_ref(),
        )
    })
}

#[derive(Serialize)]
pub struct LookupResponse {
    pub groups: Vec<Vec<VerseResult>>,
    pub search: SearchResult,
}

#[tauri::command]
pub fn lookup_bible_reference(
    state: State<AppState>,
    query: String,
    translation_id: Option<String>,
    search_options: Option<SearchOptions>,
) -> Result<LookupResponse, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        let search = bible_lookup(
            conn,
            &query,
            translation_id.as_deref(),
            search_options.as_ref(),
        )?;
        let groups = split_passage(&search.verses, 280);
        Ok(LookupResponse { groups, search })
    })
}

#[tauri::command]
pub fn list_service_plans(state: State<AppState>) -> Result<Vec<service::ServicePlanSummary>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(service::list_plans)
}

#[tauri::command]
pub fn get_service_plan(state: State<AppState>, id: String) -> Result<service::ServicePlanDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::get_plan(conn, &id))
}

#[tauri::command]
pub fn create_service_plan(
    state: State<AppState>,
    title: String,
    is_template: Option<bool>,
) -> Result<service::ServicePlanDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::create_plan(conn, &title, is_template.unwrap_or(false)))
}

#[tauri::command]
pub fn update_service_plan(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    service_date: Option<String>,
    notes: Option<String>,
    theme_id: Option<String>,
) -> Result<service::ServicePlanDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        service::update_plan(
            conn,
            &id,
            title.as_deref(),
            service_date.as_deref(),
            notes.as_deref(),
            theme_id.as_deref(),
        )
    })
}

#[tauri::command]
pub fn delete_service_plan(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::delete_plan(conn, &id))
}

#[tauri::command]
pub fn duplicate_service_plan(state: State<AppState>, id: String) -> Result<service::ServicePlanDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::duplicate_plan(conn, &id))
}

#[tauri::command]
pub fn create_service_item(
    state: State<AppState>,
    plan_id: String,
    item_type: String,
    title: String,
    content_json: String,
    operator_notes: Option<String>,
) -> Result<service::ServiceItem, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        service::create_item(
            conn,
            &plan_id,
            &item_type,
            &title,
            &content_json,
            operator_notes.as_deref(),
        )
    })
}

#[tauri::command]
pub fn update_service_item(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    content_json: Option<String>,
    operator_notes: Option<String>,
) -> Result<service::ServiceItem, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        service::update_item(
            conn,
            &id,
            title.as_deref(),
            content_json.as_deref(),
            operator_notes.as_deref(),
        )
    })
}

#[tauri::command]
pub fn delete_service_item(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::delete_item(conn, &id))
}

#[tauri::command]
pub fn reorder_service_items(
    state: State<AppState>,
    plan_id: String,
    item_ids: Vec<String>,
) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::reorder_items(conn, &plan_id, &item_ids))
}

#[tauri::command]
pub fn import_scripture_list(
    state: State<AppState>,
    plan_id: String,
    text: String,
) -> Result<Vec<service::ServiceItem>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::import_scripture_list(conn, &plan_id, &text))
}

#[tauri::command]
pub fn export_service_plan(state: State<AppState>, id: String) -> Result<String, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::export_plan_json(conn, &id))
}

#[tauri::command]
pub fn list_themes(state: State<AppState>) -> Result<Vec<service::ThemeRecord>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(service::list_themes)
}

#[tauri::command]
pub fn get_theme(state: State<AppState>, id: String) -> Result<service::ThemeRecord, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        conn.query_row(
            "SELECT id, name, config_json, is_default FROM themes WHERE id = ?1",
            params![id],
            |row| {
                Ok(service::ThemeRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    config_json: row.get(2)?,
                    is_default: row.get::<_, i32>(3)? == 1,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn save_theme(
    state: State<AppState>,
    id: Option<String>,
    name: String,
    config_json: String,
    is_default: Option<bool>,
) -> Result<service::ThemeRecord, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        service::save_theme(
            conn,
            id.as_deref(),
            &name,
            &config_json,
            is_default.unwrap_or(false),
        )
    })
}

#[tauri::command]
pub fn delete_theme(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::delete_theme(conn, &id))
}

#[tauri::command]
pub fn list_media(state: State<AppState>) -> Result<Vec<service::MediaRecord>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(service::list_media)
}

#[tauri::command]
pub fn add_media(
    state: State<AppState>,
    name: String,
    file_path: String,
    media_type: String,
) -> Result<service::MediaRecord, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::add_media(conn, &name, &file_path, &media_type))
}

#[tauri::command]
pub fn import_media_files(
    app: tauri::AppHandle,
    state: State<AppState>,
    paths: Vec<String>,
) -> Result<Vec<service::MediaRecord>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::import_media_files(conn, &paths, &app_data_dir))
}

#[tauri::command]
pub fn update_media(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    tags_json: Option<String>,
) -> Result<service::MediaRecord, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        service::update_media(
            conn,
            &id,
            name.as_deref(),
            tags_json.as_deref(),
        )
    })
}

#[tauri::command]
pub fn delete_media(app: tauri::AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::delete_media(conn, &id, &app_data_dir))
}

#[tauri::command]
pub fn save_presentation_state(
    state: State<AppState>,
    state_json: String,
    plan_id: Option<String>,
) -> Result<String, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::save_presentation_state(conn, &state_json, plan_id.as_deref()))
}

#[tauri::command]
pub fn load_presentation_state(state: State<AppState>) -> Result<Option<String>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(service::load_presentation_state)
}

#[tauri::command]
pub fn create_backup(state: State<AppState>) -> Result<String, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(service::create_backup)
}

#[tauri::command]
pub fn restore_backup(state: State<AppState>, json: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| service::restore_backup(conn, &json))
}

#[tauri::command]
pub async fn open_output_window(app: AppHandle) -> Result<(), String> {
    crate::output::ensure_output_window(app).await?;
    Ok(())
}

#[tauri::command]
pub async fn close_output_window(app: AppHandle) -> Result<(), String> {
    crate::output::close_output_window(app).await
}

#[tauri::command]
pub async fn refresh_output_window(app: AppHandle) -> Result<(), String> {
    crate::output::refresh_output_window(app).await?;
    Ok(())
}

#[tauri::command]
pub fn list_displays(app: AppHandle) -> Result<Vec<crate::display::DisplayInfo>, String> {
    crate::display::list_displays(&app)
}

#[tauri::command]
pub fn set_presentation_keep_awake(active: bool) -> Result<(), String> {
    crate::keep_awake::set_presentation_active(active);
    Ok(())
}

#[tauri::command]
pub fn get_output_status(app: AppHandle) -> Result<crate::display::OutputStatus, String> {
    crate::output::get_output_status(&app)
}

#[tauri::command]
pub fn push_program_update(
    app: AppHandle,
    scene: Option<serde_json::Value>,
) -> Result<(), String> {
    crate::output::emit_program_update(&app, scene)
}

#[tauri::command]
pub fn get_program_output() -> Option<serde_json::Value> {
    crate::output::stored_program()
}
