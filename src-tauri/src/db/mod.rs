pub mod migrations;
pub mod seed;

use rusqlite::{params, Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::sync::MutexGuard;

pub struct Database {
    pub path: PathBuf,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        Ok(Self {
            path: path.to_path_buf(),
        })
    }

    pub fn with_conn<T, F>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        let conn = Connection::open(&self.path).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        f(&conn)
    }

    pub fn migrate(&self) -> Result<bool, String> {
        self.with_conn(|conn| migrations::run_migrations(conn))
    }

    pub fn seed_if_empty(&self, app: &tauri::AppHandle) -> Result<(), String> {
        self.with_conn(|conn| seed::seed_if_empty(conn, app))
    }
}

pub fn lock_db<'a>(guard: MutexGuard<'a, Database>) -> Database {
    Database {
        path: guard.path.clone(),
    }
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value_json FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
