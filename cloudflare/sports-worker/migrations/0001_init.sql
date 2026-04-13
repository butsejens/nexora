CREATE TABLE IF NOT EXISTS sports_cache (
  cache_key TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  body TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sports_cache_expires_at ON sports_cache (expires_at);
