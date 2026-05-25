pub mod bible;
pub mod commands;
pub mod db;
pub mod display;
pub mod keep_awake;
pub mod ndi;
pub mod output;
pub mod service;
pub mod songs;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent};

pub struct AppState {
    pub db: Mutex<db::Database>,
}

static FTS_REBUILD_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("bible-show-pro.db");
            let database = db::Database::open(&db_path)?;
            let needs_fts_rebuild = database.migrate()?;
            database.seed_if_empty(app.handle())?;

            app.manage(AppState {
                db: Mutex::new(database),
            });

            if needs_fts_rebuild && !FTS_REBUILD_RUNNING.swap(true, Ordering::AcqRel) {
                let db_path_for_fts = db_path.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    eprintln!("[fts] rebuilding search index in background…");
                    let result = db::Database::open(&db_path_for_fts).and_then(|db| {
                        db.with_conn(|conn| db::migrations::repopulate_fts(conn))
                    });
                    match result {
                        Ok(()) => eprintln!("[fts] search index ready"),
                        Err(e) => eprintln!("[fts] rebuild failed: {e}"),
                    }
                    FTS_REBUILD_RUNNING.store(false, Ordering::Release);
                });
            }

            output::start_display_watcher(app.handle().clone());

            let startup_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(displays) = display::list_displays(&startup_handle) {
                    let _ = startup_handle.emit("display-changed", &displays);
                }
            });

            if let Some(main_window) = app.get_webview_window("main") {
                let shutdown_handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        output::shutdown_all(&shutdown_handle);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::init_app,
            commands::get_translations,
            commands::search_bible,
            commands::lookup_bible_reference,
            commands::bible::get_bible_catalog,
            commands::bible::download_bible_translation,
            commands::bible::import_bible_json,
            commands::bible::delete_bible_translation,
            commands::bible::set_default_bible_translation,
            commands::bible::get_bible_setup_status,
            commands::bible::install_core_bible_packages,
            commands::list_service_plans,
            commands::get_service_plan,
            commands::create_service_plan,
            commands::update_service_plan,
            commands::delete_service_plan,
            commands::duplicate_service_plan,
            commands::create_service_item,
            commands::update_service_item,
            commands::delete_service_item,
            commands::reorder_service_items,
            commands::import_scripture_list,
            commands::export_service_plan,
            commands::list_themes,
            commands::get_theme,
            commands::save_theme,
            commands::delete_theme,
            commands::list_media,
            commands::add_media,
            commands::import_media_files,
            commands::update_media,
            commands::delete_media,
            commands::save_presentation_state,
            commands::load_presentation_state,
            commands::create_backup,
            commands::restore_backup,
            commands::open_output_window,
            commands::close_output_window,
            commands::refresh_output_window,
            commands::list_displays,
            commands::get_output_status,
            commands::push_program_update,
            commands::get_program_output,
            commands::set_presentation_keep_awake,
            commands::ndi::get_ndi_config,
            commands::ndi::save_ndi_config,
            commands::ndi::start_ndi_output,
            commands::ndi::stop_ndi_output,
            commands::ndi::get_ndi_status,
            commands::ndi::discover_ndi_sources,
            commands::ndi::push_ndi_frame,
            commands::ndi::push_preview_update,
            commands::songs::list_songs,
            commands::songs::get_song,
            commands::songs::create_song,
            commands::songs::update_song,
            commands::songs::delete_song,
            commands::songs::duplicate_song,
            commands::songs::import_song_lyrics,
            commands::songs::mark_song_used,
            commands::songs::export_songs_library,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                output::shutdown_all(app_handle);
            }
        });
}
