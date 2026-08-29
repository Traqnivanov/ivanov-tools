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

CREATE INDEX IF NOT EXISTS idx_analytics_daily_summary_lookup
  ON analytics_daily_summaries(site, day);

CREATE INDEX IF NOT EXISTS idx_analytics_monthly_summary_lookup
  ON analytics_monthly_summaries(site, month);
