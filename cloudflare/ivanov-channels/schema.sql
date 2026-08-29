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

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  site TEXT NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT NOT NULL,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  tracker_version TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL DEFAULT '',
  referrer_domain TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'unknown',
  city TEXT,
  active_seconds REAL,
  total_seconds REAL,
  scroll_depth INTEGER,
  form_id TEXT
);

CREATE TABLE IF NOT EXISTS analytics_daily_summaries (
  day TEXT NOT NULL,
  site TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, site)
);

CREATE TABLE IF NOT EXISTS analytics_monthly_summaries (
  month TEXT NOT NULL,
  site TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, site)
);

CREATE INDEX IF NOT EXISTS idx_channel_daily_lookup
  ON channel_daily(provider, profile_key, day);

CREATE INDEX IF NOT EXISTS idx_rankings_lookup
  ON channel_rankings(provider, profile_key, period_start, period_end, dimension);

CREATE INDEX IF NOT EXISTS idx_analytics_events_time
  ON analytics_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session
  ON analytics_events(session_id, received_at ASC);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_summary_lookup
  ON analytics_daily_summaries(site, day);

CREATE INDEX IF NOT EXISTS idx_analytics_monthly_summary_lookup
  ON analytics_monthly_summaries(site, month);
