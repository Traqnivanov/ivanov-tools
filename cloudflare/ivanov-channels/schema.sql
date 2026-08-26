PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  granted_scopes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_profiles (
  provider TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  external_id TEXT NOT NULL,
  label TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, profile_key)
);

CREATE TABLE IF NOT EXISTS channel_daily (
  provider TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, profile_key, day, metric)
);

CREATE TABLE IF NOT EXISTS channel_rankings (
  provider TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  dimension TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, profile_key, period_start, period_end, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_channel_daily_lookup
  ON channel_daily(provider, profile_key, day);

CREATE INDEX IF NOT EXISTS idx_rankings_lookup
  ON channel_rankings(provider, profile_key, period_start, period_end, dimension);
