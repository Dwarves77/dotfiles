-- FSI Phase 2: Database Schema
-- 10 tables for Freight Sustainability Intelligence

-- ─── Resources ───────────────────────────────────────────────
CREATE TABLE resources (
  id                  TEXT PRIMARY KEY,
  category            TEXT NOT NULL,
  subcategory         TEXT NOT NULL DEFAULT '',
  title               TEXT NOT NULL,
  url                 TEXT NOT NULL DEFAULT '',
  note                TEXT NOT NULL DEFAULT '',
  type                TEXT NOT NULL DEFAULT '',
  priority            TEXT NOT NULL DEFAULT 'MODERATE'
                      CHECK (priority IN ('CRITICAL','HIGH','MODERATE','LOW')),
  reasoning           TEXT NOT NULL DEFAULT '',
  tags                TEXT[] NOT NULL DEFAULT '{}',
  what_is_it          TEXT NOT NULL DEFAULT '',
  why_matters         TEXT NOT NULL DEFAULT '',
  key_data            TEXT[] NOT NULL DEFAULT '{}',
  modes               TEXT[] NOT NULL DEFAULT '{}',
  topic               TEXT,
  jurisdiction        TEXT,
  added_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  modified_date       DATE,
  is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
  archived_date       DATE,
  archive_reason      TEXT,
  archive_note        TEXT,
  archive_replacement TEXT,
  lifecycle_stage     TEXT,
  provenance_level    TEXT,
  last_verified       DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Timelines ───────────────────────────────────────────────
CREATE TABLE timelines (
  id          SERIAL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  label       TEXT NOT NULL,
  status      TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE(resource_id, date, label)
);

-- ─── Changelog ───────────────────────────────────────────────
CREATE TABLE changelog (
  id          SERIAL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  type        TEXT NOT NULL DEFAULT 'UPDATED'
              CHECK (type IN ('NEW','UPDATED')),
  fields      TEXT[],
  prev_value  TEXT,
  now_value   TEXT,
  impact      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Disputes ────────────────────────────────────────────────
CREATE TABLE disputes (
  id          SERIAL PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  note        TEXT NOT NULL,
  sources     JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(resource_id)
);

-- ─── Cross References ────────────────────────────────────────
CREATE TABLE cross_references (
  id           SERIAL PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  target_id    TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'references',
  UNIQUE(source_id, target_id)
);

-- ─── Supersessions ───────────────────────────────────────────
CREATE TABLE supersessions (
  id          SERIAL PRIMARY KEY,
  old_id      TEXT NOT NULL,
  old_title   TEXT NOT NULL,
  old_url     TEXT NOT NULL DEFAULT '',
  new_id      TEXT NOT NULL,
  new_title   TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('major','minor','replacement')),
  date        TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  timeline    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Source Registry ─────────────────────────────────────────
CREATE TABLE source_registry (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  region          TEXT,
  type            TEXT,
  check_frequency TEXT NOT NULL DEFAULT 'weekly',
  last_checked    TIMESTAMPTZ,
  last_change     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Staged Updates ──────────────────────────────────────────
CREATE TABLE staged_updates (
  id            SERIAL PRIMARY KEY,
  action        TEXT NOT NULL CHECK (action IN ('create','update','archive','dispute','new_source')),
  resource_id   TEXT,
  proposed_data JSONB,
  reason        TEXT,
  source_url    TEXT,
  confidence    TEXT NOT NULL DEFAULT 'MEDIUM'
                CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  batch_id      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Briefings ───────────────────────────────────────────────
CREATE TABLE briefings (
  id          SERIAL PRIMARY KEY,
  week_date   DATE NOT NULL,
  title       TEXT,
  summary     TEXT,
  content     JSONB NOT NULL DEFAULT '{}',
  format      TEXT NOT NULL DEFAULT 'html',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer',
  settings     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
