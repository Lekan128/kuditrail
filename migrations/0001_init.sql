-- KudiTrail D1 database: what people send in.
-- Apply: npx wrangler d1 migrations apply kuditrail --remote   (or --local)

CREATE TABLE IF NOT EXISTS updates (
  id           TEXT PRIMARY KEY,
  fund_id      TEXT NOT NULL,
  node_id      TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  contact      TEXT NOT NULL DEFAULT '',   -- private, never published
  location     TEXT NOT NULL DEFAULT '',
  observed_on  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL,
  message      TEXT NOT NULL,
  links        TEXT NOT NULL DEFAULT '[]', -- JSON array of URLs
  photo        TEXT,                       -- R2 key, or NULL
  moderation   TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at   TEXT NOT NULL,
  moderated_at TEXT,
  ip           TEXT NOT NULL               -- salted hash, for rate limiting only
);
CREATE INDEX IF NOT EXISTS updates_public ON updates (moderation, fund_id, created_at);
CREATE INDEX IF NOT EXISTS updates_ip ON updates (ip, created_at);

CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  fund_id      TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL,
  links        TEXT NOT NULL DEFAULT '[]',
  state        TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  ip           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_created ON contacts (created_at);
CREATE INDEX IF NOT EXISTS contacts_ip ON contacts (ip, created_at);
