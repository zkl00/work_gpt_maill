CREATE TABLE IF NOT EXISTS shared_links (
  id TEXT PRIMARY KEY,
  subscription_ids TEXT NOT NULL,
  allow_edit INTEGER NOT NULL DEFAULT 0 CHECK (allow_edit IN (0, 1)),
  allow_delete INTEGER NOT NULL DEFAULT 0 CHECK (allow_delete IN (0, 1)),
  visible_columns TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

