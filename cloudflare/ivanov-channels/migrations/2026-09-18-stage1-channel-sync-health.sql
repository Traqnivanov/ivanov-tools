CREATE TABLE IF NOT EXISTS channel_sync_status (
  provider TEXT NOT NULL,
  profile_key TEXT NOT NULL DEFAULT '',
  last_status TEXT NOT NULL DEFAULT 'error',
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  last_points INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, profile_key)
);

CREATE INDEX IF NOT EXISTS idx_channel_sync_status_provider
  ON channel_sync_status(provider, profile_key);
