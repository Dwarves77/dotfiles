-- subject: Migration 266 (`theme_briefs` — F5 theme-brief storage, flywheel U6, operator-ruled 2026-08-21). One row per connection theme: `theme_id` uuid PK (NO FK — `connection_themes` is a cache the U2 pass REPLACES WHOLESALE, and theme ids are the lexicographically smallest member id, stable under re-clustering; an FK would make every re-cluster destroy durable editorial content), `member_hash` (md5 of the theme's sorted member_ids at generation time), `member_count`, `title`, `brief_md`, `generated_at` default now(), `generated_by` default 'session-executor'. WHY A TABLE, NOT A COLUMN: a brief column on connection_themes would be destroyed by every guardedDelete-all re-cluster; briefs are durable content keyed to theme identity and must SURVIVE re-clustering. STALENESS DETECTED, NEVER SILENT: the read path (admin themes route) recomputes the live membership hash via `src/lib/connections/brief-staleness.mjs` (the ONE home for the hash rule, F25-wired); mismatch renders a STALE badge, never silently-wrong current content; a brief whose theme id vanishes is orphaned and hidden by the join, kept as history. RLS ENABLED WITH NO POLICIES = deny-all to anon/authenticated; service role bypasses by construction (writes are operator-directed session-executor passes only — no trigger, no cron, $0 standing directive). **APPLIED LIVE 2026-08-21** via delegated DDL (additive, no customer read path) — verified post-write: 9 rows, every row hash-fresh against live connection_themes, `brief_md` 970–5,156 chars, all payload-md5-checksummed writes. Reversible (`DROP TABLE public.theme_briefs`). [glyph:verbatim]
-- 266 — theme_briefs: the storage home for F5 theme-brief synthesis (flywheel U6, operator-ruled 2026-08-21).
--
-- WHY A SEPARATE TABLE, NOT A COLUMN ON connection_themes: connection_themes is a CACHE the U2 pass
-- (scripts/connections/analyze-corpus.mjs) REPLACES WHOLESALE on every run (guardedDelete-all +
-- guardedInsertMany). A brief column there would be destroyed by every re-cluster. Briefs are durable
-- editorial content keyed to a theme identity, so they live in their own table and SURVIVE re-clustering.
--
-- STALENESS IS DETECTED, NEVER SILENT: member_hash is the md5 of the theme's sorted member_ids at
-- generation time. A read path that joins theme_briefs to a fresh connection_themes row compares hashes:
-- mismatch = the theme's membership changed since the brief was written = the brief renders as STALE
-- (regeneration candidate), not as silently-wrong current content. Theme ids are the lexicographically
-- smallest member id (cluster.mjs), stable under re-clustering unless the smallest member itself changes;
-- a brief whose theme id vanishes from connection_themes is ORPHANED and hidden by the join, kept as
-- history, never invented into the UI.
--
-- SPEND: generation is session-executed ($0, operator standing directive 2026-08-21: the build never
-- spends). No trigger, no cron, no clock — rows are written only by an operator-directed pass.
--
-- Two-track policy: DDL applied live first (this file), code lands with the same PR (relay convention,
-- flywheel-build-plan "Sequencing + definition of done").

CREATE TABLE IF NOT EXISTS public.theme_briefs (
  theme_id uuid PRIMARY KEY,
  member_hash text NOT NULL,
  member_count integer NOT NULL,
  title text NOT NULL,
  brief_md text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'session-executor'
);

COMMENT ON TABLE public.theme_briefs IS 'F5 theme-brief synthesis (flywheel U6). Durable per-theme editorial content; survives connection_themes cache replacement. member_hash = md5 of sorted member_ids at generation; hash mismatch against the live theme = stale brief (regeneration candidate).';

-- Service-role writes only (session-executor / operator passes); same read posture as connection_themes
-- (admin route reads via service client). RLS on with no policies = deny-all to anon/authenticated;
-- the service role bypasses RLS by construction.
ALTER TABLE public.theme_briefs ENABLE ROW LEVEL SECURITY;
