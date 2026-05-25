use crate::db::{get_setting, set_setting};
use rusqlite::{params, Connection};

pub fn seed_if_empty(conn: &Connection, _app: &tauri::AppHandle) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM bible_translations", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if count > 0 {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO bible_translations (id, name, abbreviation, language, copyright, is_default)
         VALUES ('kjv', 'King James Version', 'KJV', 'en', 'Public Domain', 1)",
        [],
    )
    .map_err(|e| e.to_string())?;

    seed_default_theme(conn)?;
    set_setting(conn, "app_initialized", "true")?;
    Ok(())
}

fn seed_default_theme(conn: &Connection) -> Result<(), String> {
    let theme = serde_json::json!({
        "backgroundColor": "#0f172a",
        "textColor": "#f8fafc",
        "fontFamily": "Georgia, serif",
        "fontSize": 48,
        "referenceColor": "#94a3b8",
        "referencePosition": "footer",
        "showVerseNumbers": true,
        "padding": 64,
        "backgroundType": "solid",
        "backgroundGradient": { "from": "#0f172a", "to": "#1e293b", "angle": 160 },
        "backgroundOverlay": 0.45,
        "textAlign": "center",
        "verticalAlign": "center",
        "lineHeight": 1.45,
        "letterSpacing": 0,
        "fontWeight": 400,
        "referenceStyle": "caps",
        "referenceFontSize": 14,
        "textShadow": false,
        "shadowColor": "rgba(0,0,0,0.6)",
        "accentColor": "#2563eb",
        "maxContentWidth": 88,
        "lowerThird": {
            "enabled": true,
            "barColor": "rgba(15,23,42,0.92)",
            "barHeight": 28,
            "textSize": 22
        },
        "autoFit": true,
        "showReference": true,
        "showVersion": true
    });

    conn.execute(
        "INSERT INTO themes (id, name, config_json, is_default) VALUES ('default', 'Default Dark', ?1, 1)",
        params![theme.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn is_initialized(conn: &Connection) -> Result<bool, String> {
    Ok(get_setting(conn, "app_initialized")?.is_some())
}
