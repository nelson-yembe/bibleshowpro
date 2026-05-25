use serde::{Deserialize, Serialize};

pub const CATALOG_JSON: &str = include_str!("../../../database/catalog/translations.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
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
}

pub fn load_catalog() -> Result<Vec<CatalogEntry>, String> {
    serde_json::from_str(CATALOG_JSON).map_err(|e| e.to_string())
}

pub fn find_catalog_entry(id: &str) -> Result<CatalogEntry, String> {
    load_catalog()?
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("Unknown translation catalog id: {id}"))
}
