use crate::bible::catalog::{find_catalog_entry, load_catalog, CatalogEntry};
use crate::bible::convert::{fetch_bible_api_payload, payload_from_helloao, payload_from_thiagobodruk};
use crate::bible::import::{
    import_payload, verse_count_for_translation, ImportPayload, ImportStats, ImportTranslation,
};
use rusqlite::Connection;
use std::path::Path;

pub const FULL_BIBLE_MIN_VERSES: i64 = 30_000;

pub const CORE_PACKAGE_IDS: &[&str] = &["kjv", "bbe", "web"];

pub type ProgressFn = Box<dyn Fn(&str) + Send + Sync>;

pub fn needs_full_bible(conn: &Connection, translation_id: &str) -> Result<bool, String> {
    let count = verse_count_for_translation(conn, translation_id)?;
    Ok(count < FULL_BIBLE_MIN_VERSES)
}

pub fn any_core_package_missing(conn: &Connection) -> Result<bool, String> {
    for &id in CORE_PACKAGE_IDS {
        if needs_full_bible(conn, id)? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn translation_meta(entry: &CatalogEntry) -> ImportTranslation {
    ImportTranslation {
        id: entry.id.clone(),
        name: entry.name.clone(),
        abbreviation: entry.abbreviation.clone(),
        language: entry.language.clone(),
        copyright: Some(entry.copyright.clone()),
    }
}

pub async fn fetch_catalog_payload(
    entry: &CatalogEntry,
    on_progress: Option<&ProgressFn>,
) -> Result<ImportPayload, String> {
    let url = entry
        .download_url
        .clone()
        .ok_or_else(|| "No download URL configured.".to_string())?;

    if let Some(cb) = &on_progress {
        cb(&format!("Downloading {}...", entry.name));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .user_agent("BibleShowPro/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    match entry.source_format.as_str() {
        "thiagobodruk" => {
            let body = client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .text()
                .await
                .map_err(|e| e.to_string())?;
            payload_from_thiagobodruk(&body, translation_meta(entry))
        }
        "bible_api" => {
            fetch_bible_api_payload(
                &client,
                &entry.id,
                &url,
                translation_meta(entry),
                |current, total, message| {
                    if let Some(cb) = &on_progress {
                        cb(&format!("{message} ({current}/{total})"));
                    }
                },
            )
            .await
        }
        "helloao" => {
            let body = client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .text()
                .await
                .map_err(|e| e.to_string())?;
            payload_from_helloao(&body, translation_meta(entry))
        }
        other => Err(format!("Unsupported source format: {other}")),
    }
}

pub async fn ensure_core_packages(
    db_path: &Path,
    on_progress: Option<ProgressFn>,
) -> Result<Vec<ImportStats>, String> {
    let db = crate::db::Database::open(db_path)?;
    db.migrate()?;

    let mut installed = Vec::new();
    for &id in CORE_PACKAGE_IDS {
        let needs = db.with_conn(|conn| needs_full_bible(conn, id))?;
        if !needs {
            if let Some(cb) = &on_progress {
                cb(&format!("{id} already complete — skipping"));
            }
            continue;
        }

        let entry = find_catalog_entry(id)?;
        if entry.install_method != "download" {
            continue;
        }

        let payload = match fetch_catalog_payload(&entry, on_progress.as_ref()).await {
            Ok(p) => p,
            Err(e) => {
                if let Some(cb) = &on_progress {
                    cb(&format!("Failed to download {}: {e}", entry.abbreviation));
                }
                continue;
            }
        };

        if let Some(cb) = &on_progress {
            cb(&format!("Importing {} into database...", entry.abbreviation));
        }

        let stats = db.with_conn(|conn| import_payload(conn, &payload, entry.is_default))?;

        if let Some(cb) = &on_progress {
            cb(&format!(
                "{} installed — {} verses",
                stats.abbreviation, stats.verse_count
            ));
        }

        installed.push(stats);
    }

    Ok(installed)
}

pub fn packages_to_install(conn: &Connection) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    for entry in load_catalog()? {
        if entry.install_method == "download" && needs_full_bible(conn, &entry.id)? {
            ids.push(entry.id);
        }
    }
    Ok(ids)
}
