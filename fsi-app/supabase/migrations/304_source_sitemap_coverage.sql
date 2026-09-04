-- 304 — sitemap-coverage columns on `sources` (lane SITEMAP-3, 2026-09-04).
--
-- THE ASK, VERBATIM (operator, 2026-09-04): "do you do mapping of the sites and store them in supabase
-- so we can use a site map to identify new pages? … you will have to backfill sources with sitemap info
-- in supabase" and "did you do mapping of rss feeds and save them in supabase?".
--
-- THE FACTS THIS MIGRATION ANSWERS TO [CONFIRMED, live SQL, this lane, 2026-09-04]. `sources` holds 2,563
-- rows (1,630 active); `rss_feed_url` is already a column (migration 056) and IS populated — 189 rows,
-- via lane SITEMAP's `walkSource` (feed-discovery-first, `src/lib/sources/sitemap-walk.mjs`) — so the
-- second question is already YES, just not visible as a coverage NUMBER anywhere. The sitemap URL-SET
-- itself (every `<loc>`/`<lastmod>` a walk saw) is stored — but in Supabase STORAGE, not a table:
-- `sitemap-snapshots/<source_id>/current.json.gz` in the `raw_fetches` bucket (deliberately NOT the
-- `raw_fetches` DB TABLE — see `run-source-sweep.mjs`'s own header on why a JSON url-set row there would
-- corrupt `change-sweep.mjs`'s HTML diff, rule B1). What is missing, and what made the operator's own
-- first framing of a backfill ("2,563 dispatches") true: NOTHING in `sources` says, per row, whether it
-- has EVER been sitemap-walked, when, what was found, or why not — so there was no queryable answer to
-- "have we mapped this site's sitemap" short of grepping harness-run artifacts by hand. This migration is
-- that answer surface: five nullable, additive columns the driver (`run-source-sweep.mjs`'s
-- `buildSitemapCoveragePatch`, this lane) writes through `db.mjs`'s guarded path on EVERY sitemap walk —
-- feed found, sitemap walked, bot-walled, no sitemap discoverable, or an uncaught fetch error — never only
-- on success, because `--all-hosts`'s own resumability (never-walked hosts first, then oldest-walked)
-- depends on every attempted host eventually leaving the "never walked" bucket, not just the ones that
-- happened to succeed.
--
-- WHY FIVE COLUMNS, NOT ONE JSONB BLOB. Each is independently queryable and independently NULL-able for
-- a row that has never been through this code path at all (the honest "not yet classified" convention
-- migration 288 already set for `sources.source_type` — NULL is a real, distinct state here too, not an
-- assertion of "no sitemap"):
--   sitemap_url               text          the sitemap document this source's last successful walk
--                                            actually fetched first (robots.txt's own first `Sitemap:`
--                                            line, or the fallback candidate that parsed) — a pointer for
--                                            a human/coordinator to go look, not a re-fetch instruction
--                                            (the walker re-discovers on every run; this is not cached
--                                            for reuse). Written ONLY on a successful walk (outcome
--                                            'walked') — see buildSitemapCoveragePatch's own header for
--                                            why a non-walked outcome never nulls out a prior value.
--   sitemap_last_walked_at    timestamptz   stamped on EVERY attempt (walked / bot_wall / no_sitemap /
--                                            unfetchable), regardless of outcome — the resumability clock
--                                            --all-hosts orders by.
--   sitemap_url_count         int           the SCOPED, CURRENT url-entry count the last successful walk
--                                            found for this source's own registered path (mirrors
--                                            walkSitemap's own `urlCount`) — written only alongside
--                                            sitemap_url, same reasoning.
--   sitemap_walk_outcome      text          one of 'walked' / 'no_sitemap' / 'bot_wall' / 'feed_only' /
--                                            'unfetchable' (CHECK-constrained below) — 'feed_only' means
--                                            a feed was found and used per the operator's own discovery
--                                            order, so the sitemap itself was never walked THIS run (a
--                                            prior sitemap_url from an earlier, different walk of the
--                                            same source may still be present and still accurate — not
--                                            cleared just because this walk didn't need it).
--   feed_last_probed_at       timestamptz   stamped whenever `walkSource`'s feed-discovery phase
--                                            DEFINITELY ran (outcome 'feed_only' or any sitemap-branch
--                                            outcome — walkSource always tries feed discovery first) —
--                                            OMITTED on 'unfetchable' (an uncaught exception whose phase
--                                            is not reliably known).
--
-- ADDITIVE, NULLABLE, NO DEFAULT — matches migration 288's own SCOPE DEVIATION reasoning verbatim: a
-- default of e.g. 'walked' or now() would assert coverage for the 2,563 existing rows this migration
-- cannot back. Written by db.mjs's guarded `guardedUpdate("sources", ...)` path only, never a bulk
-- backfill UPDATE in this file.
--
-- SELF-CHECK (read-only, via Supabase MCP `execute_sql`, project kwrsbpiseruzbfwjpvsp, 2026-09-04 — NO
-- write performed by this lane; confirms none of the five columns already exist under a different
-- migration, so this is a genuinely new addition, not a duplicate):
--
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sources'
--    AND column_name IN ('sitemap_url','sitemap_last_walked_at','sitemap_url_count',
--                         'sitemap_walk_outcome','feed_last_probed_at');
--   -- => 0 rows (2026-09-04) — confirmed none of the five exist yet.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS (matches migration 054/055/288's own convention for this table);
-- the CHECK constraint and the two indexes are each guarded by an existence probe, matching migration
-- 288's own DO-block pattern for this exact table, so a re-run of this file is a no-op.
--
-- WRITTEN, NOT APPLIED BY THIS LANE. Supabase MCP is read-only for this lane (SITEMAP-3's own charter);
-- the coordinator applies this file via Supabase MCP after landing, then the post-check block at the
-- bottom (same shape as migration 288's) is what actually verifies the live result.
--
-- Reversible: `ALTER TABLE public.sources DROP COLUMN sitemap_url, DROP COLUMN sitemap_last_walked_at,
-- DROP COLUMN sitemap_url_count, DROP COLUMN sitemap_walk_outcome, DROP COLUMN feed_last_probed_at;`
-- (drops the two indexes and the CHECK constraint along with their columns).

-- 1. The five columns. All NULLable, no default — see header.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS sitemap_url text,
  ADD COLUMN IF NOT EXISTS sitemap_last_walked_at timestamptz,
  ADD COLUMN IF NOT EXISTS sitemap_url_count int,
  ADD COLUMN IF NOT EXISTS sitemap_walk_outcome text,
  ADD COLUMN IF NOT EXISTS feed_last_probed_at timestamptz;

-- 2. Validity CHECK on sitemap_walk_outcome — the five values `buildSitemapCoveragePatch`
-- (fsi-app/scripts/turns/run-source-sweep.mjs) ever writes, byte-for-byte (drift-guarded by that
-- function's own test, run-source-sweep.test.mjs). NULL (not yet walked) passes — same NULL-is-honest
-- convention as migration 288's `sources_source_type_valid`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sources_sitemap_walk_outcome_valid' AND conrelid = 'public.sources'::regclass
  ) THEN
    ALTER TABLE public.sources
      ADD CONSTRAINT sources_sitemap_walk_outcome_valid CHECK (
        sitemap_walk_outcome IS NULL OR sitemap_walk_outcome = ANY (ARRAY[
          'walked',
          'no_sitemap',
          'bot_wall',
          'feed_only',
          'unfetchable'
        ]::text[])
      );
  END IF;
END $$;

-- 3. Indexes for the two query shapes this migration exists to serve:
--    (a) --check-coverage / --all-hosts's own ordering: "which active sources have never been walked, or
--        were walked longest ago" — a partial index on sitemap_last_walked_at (NULL sorts as "never," so
--        a plain ORDER BY sitemap_last_walked_at NULLS FIRST already puts never-walked rows first without
--        needing a second predicate; scoped to active rows since that's the only population --all-hosts
--        or --check-coverage's "unwalked" count ever selects over).
--    (b) a coverage-by-outcome breakdown (--check-coverage's own report) grouping on sitemap_walk_outcome.
CREATE INDEX IF NOT EXISTS idx_sources_sitemap_last_walked_at
  ON public.sources (sitemap_last_walked_at NULLS FIRST)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sources_sitemap_walk_outcome
  ON public.sources (sitemap_walk_outcome)
  WHERE status = 'active';

-- 4. Documentation.
COMMENT ON COLUMN public.sources.sitemap_url IS
  'The sitemap document this source''s last SUCCESSFUL sitemap walk fetched first (a pointer, not a '
  'cache — the walker re-discovers robots.txt/fallback candidates on every run). NULL until the first '
  'successful walk; a prior value is never cleared by a later walk whose outcome was feed_only/bot_wall/'
  'no_sitemap/unfetchable (that walk determined nothing new about the sitemap itself). Written by '
  'buildSitemapCoveragePatch, fsi-app/scripts/turns/run-source-sweep.mjs (migration 304, lane SITEMAP-3, '
  '2026-09-04); read by --walker sitemap --check-coverage.';

COMMENT ON COLUMN public.sources.sitemap_last_walked_at IS
  'Stamped on EVERY sitemap-walk attempt for this source (walked / bot_wall / no_sitemap / unfetchable), '
  'regardless of outcome -- the resumability clock --walker sitemap --all-hosts orders its host selection '
  'by (never-walked hosts first, then oldest sitemap_last_walked_at). NULL means never attempted. Written '
  'by buildSitemapCoveragePatch (migration 304, lane SITEMAP-3, 2026-09-04).';

COMMENT ON COLUMN public.sources.sitemap_url_count IS
  'The SCOPED, CURRENT url-entry count sitemap-walk.mjs''s walkSitemap found for this source''s own '
  'registered path, as of sitemap_last_walked_at -- written only alongside a successful sitemap_url (same '
  'never-clear-on-a-non-sitemap-outcome rule). Migration 304, lane SITEMAP-3, 2026-09-04.';

COMMENT ON COLUMN public.sources.sitemap_walk_outcome IS
  'One of walked / no_sitemap / bot_wall / feed_only / unfetchable (CHECK sources_sitemap_walk_outcome_'
  'valid) -- the last sitemap-walk attempt''s disposition for this source. NULL means never attempted '
  '(not an assertion of "no sitemap," same NULL-is-honest convention as sources.source_type, migration '
  '288). feed_only means a feed was found and used per the operator''s discovery order, so the sitemap '
  'itself was not walked THIS run -- a previously-recorded sitemap_url/sitemap_url_count may still be '
  'accurate and is left untouched. Migration 304, lane SITEMAP-3, 2026-09-04.';

COMMENT ON COLUMN public.sources.feed_last_probed_at IS
  'Stamped whenever sitemap-walk.mjs''s walkSource DEFINITELY ran its feed-discovery phase to completion '
  '(every outcome except unfetchable, where the phase that threw is not reliably known). Distinct from '
  'rss_feed_url (migration 056, the discovered feed URL itself, written only when a feed IS found) -- '
  'this column is stamped on every probe, feed found or not, so "have we even checked this source for a '
  'feed" is answerable independently of whether one exists. Migration 304, lane SITEMAP-3, 2026-09-04.';

-- ── Post-check (idempotent — safe to re-run; matches migration 288's own shape) ─────────────────────────
DO $$
DECLARE
  n_check int;
  n_idx_walked int;
  n_idx_outcome int;
  missing text;
BEGIN
  SELECT string_agg(col, ', ') INTO missing
    FROM unnest(ARRAY['sitemap_url','sitemap_last_walked_at','sitemap_url_count',
                       'sitemap_walk_outcome','feed_last_probed_at']) AS col
   WHERE col NOT IN (
     SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sources'
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: sources is missing expected column(s): %', missing;
  END IF;

  SELECT count(*) INTO n_check FROM pg_constraint
    WHERE conname = 'sources_sitemap_walk_outcome_valid' AND conrelid = 'public.sources'::regclass;
  IF n_check <> 1 THEN
    RAISE EXCEPTION 'ABORT: sources_sitemap_walk_outcome_valid CHECK constraint missing (found %)', n_check;
  END IF;

  SELECT count(*) INTO n_idx_walked FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sources' AND indexname = 'idx_sources_sitemap_last_walked_at';
  IF n_idx_walked <> 1 THEN
    RAISE EXCEPTION 'ABORT: idx_sources_sitemap_last_walked_at index missing (found %)', n_idx_walked;
  END IF;

  SELECT count(*) INTO n_idx_outcome FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'sources' AND indexname = 'idx_sources_sitemap_walk_outcome';
  IF n_idx_outcome <> 1 THEN
    RAISE EXCEPTION 'ABORT: idx_sources_sitemap_walk_outcome index missing (found %)', n_idx_outcome;
  END IF;

  RAISE NOTICE 'migration 304 OK: sources.{sitemap_url, sitemap_last_walked_at, sitemap_url_count, '
    'sitemap_walk_outcome, feed_last_probed_at} present (all nullable, no default); CHECK '
    'sources_sitemap_walk_outcome_valid (5-value vocabulary); both partial indexes present';
END $$;
