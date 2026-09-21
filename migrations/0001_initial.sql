-- Persistent storage for the Cloudflare D1 deployment.
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  account_email TEXT NOT NULL COLLATE NOCASE,
  service_type TEXT NOT NULL,
  chatgpt_plan TEXT,
  activated_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  status TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  notification_email TEXT NOT NULL,
  reminder_enabled INTEGER NOT NULL CHECK (reminder_enabled IN (0, 1)),
  reminder_days_before INTEGER NOT NULL,
  reminder_source TEXT NOT NULL,
  reminder_confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(account_email, expires_on)
);

CREATE INDEX IF NOT EXISTS subscriptions_expires_on_idx ON subscriptions(expires_on);

CREATE TABLE IF NOT EXISTS sent_reminders (
  subscription_id TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('automatic', 'manual')),
  sent_at TEXT NOT NULL,
  PRIMARY KEY (subscription_id, expires_on, kind),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_config TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
