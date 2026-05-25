-- Bible Show Pro — Phase 1 schema

CREATE TABLE IF NOT EXISTS bible_translations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  copyright TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bible_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE,
  book_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  testament TEXT NOT NULL CHECK (testament IN ('OT', 'NT')),
  chapter_count INTEGER NOT NULL,
  UNIQUE (translation_id, book_number)
);

CREATE TABLE IF NOT EXISTS bible_verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL REFERENCES bible_translations(id) ON DELETE CASCADE,
  book_number INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (translation_id, book_number, chapter, verse)
);

CREATE VIRTUAL TABLE IF NOT EXISTS bible_search_index USING fts5(
  verse_text,
  reference,
  translation_id UNINDEXED,
  book_number UNINDEXED,
  chapter UNINDEXED,
  verse UNINDEXED
);

CREATE TABLE IF NOT EXISTS service_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service_date TEXT,
  notes TEXT,
  theme_id TEXT,
  is_template INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_items (
  id TEXT PRIMARY KEY,
  service_plan_id TEXT NOT NULL REFERENCES service_plans(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'scripture', 'song', 'announcement', 'image', 'video',
    'sermon_note', 'countdown', 'speaker_lower_third',
    'blank', 'blackout', 'logo'
  )),
  title TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  operator_notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  service_item_id TEXT NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  slide_type TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  thumbnail_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS presentation_sessions (
  id TEXT PRIMARY KEY,
  service_plan_id TEXT REFERENCES service_plans(id) ON DELETE SET NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bible_verses_lookup
  ON bible_verses (translation_id, book_number, chapter, verse);

CREATE INDEX IF NOT EXISTS idx_service_items_plan_order
  ON service_items (service_plan_id, sort_order);
