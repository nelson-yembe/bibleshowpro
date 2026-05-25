use crate::db::lock_db;
use crate::songs::{
    CreateSongInput, ImportSongResult, SongDetail, SongSummary, UpdateSongInput,
};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn list_songs(
    state: State<AppState>,
    filter: Option<String>,
    query: Option<String>,
) -> Result<Vec<SongSummary>, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        crate::songs::list_songs(
            conn,
            filter.as_deref(),
            query.as_deref(),
        )
    })
}

#[tauri::command]
pub fn get_song(state: State<AppState>, id: String) -> Result<SongDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::get_song(conn, &id))
}

#[tauri::command]
pub fn create_song(state: State<AppState>, input: CreateSongInput) -> Result<SongDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::create_song(conn, &input))
}

#[tauri::command]
pub fn update_song(state: State<AppState>, input: UpdateSongInput) -> Result<SongDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::update_song(conn, &input))
}

#[tauri::command]
pub fn delete_song(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::delete_song(conn, &id))
}

#[tauri::command]
pub fn duplicate_song(state: State<AppState>, id: String) -> Result<SongDetail, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::duplicate_song(conn, &id))
}

#[tauri::command]
pub fn import_song_lyrics(
    state: State<AppState>,
    title: String,
    artist: Option<String>,
    raw_text: String,
    tags_json: Option<String>,
) -> Result<ImportSongResult, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| {
        crate::songs::import_song_from_text(conn, title, artist, raw_text, tags_json)
    })
}

#[tauri::command]
pub fn mark_song_used(state: State<AppState>, id: String) -> Result<(), String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(|conn| crate::songs::mark_song_used(conn, &id))
}

#[tauri::command]
pub fn export_songs_library(state: State<AppState>) -> Result<String, String> {
    let db = lock_db(state.db.lock().map_err(|e| e.to_string())?);
    db.with_conn(crate::songs::export_songs_library)
}
