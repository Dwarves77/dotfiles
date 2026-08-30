#!/usr/bin/env node
// Generator for supabase/migrations/268_market_series.sql.
//
// WO-16 (Market series producers), master execution plan v2 Stage 7 (docs/plans/master-execution-plan-
// 2026-08-17.md), reconciled with the WO-16.2 operator ruling recorded in
// docs/plans/connection-redesign-and-build-scope-2026-08-29.md §4 ("Rulings already held … WO-16.2 FEED
// published_price_statistics from market_series"): market_series is the new time-series spine; the
// existing published_price_statistics table stays the item-page display cache and is FED from this table
// by a small, separate refresher (src/lib/market/refresh-published-price-statistics.mjs — read-model
// only, no schema change to published_price_statistics).
//
// WHY A GENERATOR, mirroring scripts/gen/migration-267-origin-class-and-envelope.mjs exactly: this table
// is envelope-carrying (WO-16 step 1: "envelope-carrying, from WO-12's shape"). The envelope columns
// (value_numeric, unit, currency, derivation +CHECK, origin_class +CHECK, source_key, source_ref,
// n_observations, method_version, as_at_date, reference_period) come from the SAME single generalised
// renderer 267 already uses, src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL() — never a
// hand-typed CHECK, per the WO-16 executor brief's explicit instruction and the migration-263
// duplicated-CHECK cautionary tale it cites. The two table-owned columns this table needs beyond the
// envelope (series_key, label) and the UNIQUE(series_key, reference_period) keying are NOT part of the
// envelope shape (they are this table's own identity, the same way emission_factors' scope/quantity
// columns are its own doctrine, not the envelope's) and are hand-written CREATE TABLE DDL, which the
// executor brief's "do not hand-write CHECK constraints [for the envelope]" instruction does not reach.
//
// Re-run with:  node scripts/gen/migration-268-market-series.mjs
// It rewrites the migration in place. Committing the regenerated diff is how a column-set change ships.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderEnvelopeDDL, ENVELOPE_COLUMN_KEYS } from "../../src/lib/contracts/provenance-envelope.mjs";

export const MARKET_SERIES_ENVELOPE_COLUMNS = ENVELOPE_COLUMN_KEYS;

export const MARKERS = {
  market_series_envelope: () => renderEnvelopeDDL("market_series", { columns: MARKET_SERIES_ENVELOPE_COLUMNS }),
};

export function block(name) {
  return `-- >>> GENERATED: ${name} >>>\n${MARKERS[name]()}\n-- <<< END GENERATED: ${name} <<<`;
}

export function renderMigration() {
  return `-- 268 — market_series: the WO-16 time-series spine (2026-08-30).
--
-- WHAT THIS CREATES. A new, envelope-carrying table keyed (series_key, reference_period) — one row per
-- published observation of one named series for one reference period. WO-16 step 1 (master execution
-- plan v2, docs/plans/master-execution-plan-2026-08-17.md): "New table market_series (envelope-carrying,
-- from WO-12's shape) keyed (series_key, reference_period): EU Weekly Oil Bulletin, EEX EUA auctions,
-- ECB FX, EIA v2. One producer per PR, fixture-tested parser, idempotent upsert, kill-switched, default
-- off." This migration is schema only — it creates the table and seeds NOTHING; the first producer (EU
-- Weekly Oil Bulletin, scripts/producers/market/eu-weekly-oil-bulletin.mjs) ships kill-switched off in
-- the SAME PR and is a separate, later, operator-armed write.
--
-- RULING ON RECORD (WO-16.2, held — docs/plans/connection-redesign-and-build-scope-2026-08-29.md §4):
-- option (a), FEED published_price_statistics from market_series. published_price_statistics (migration
-- 151/152) stays the item-page display cache PriceBoard reads (fsi-app/src/app/market/[slug]/page.tsx);
-- it is UNTOUCHED by this migration — no column added, no column removed, no row written. A separate
-- refresher (src/lib/market/refresh-published-price-statistics.mjs) derives its rows from market_series
-- for series an operator-ratified mapping names; that mapping is empty today (no market_series row yet
-- maps to a published_price_statistics item — see the refresher's own header for why guessing one would
-- misattribute a benchmark).
--
-- THE ENVELOPE. Every non-identity column below (value_numeric … reference_period) is emitted by
-- src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL("market_series", { columns:
-- ENVELOPE_COLUMN_KEYS }) — the SAME renderer, importing the SAME origin_class (7-value) and derivation
-- (9-value) vocabularies, migration 267 already used to extend regional_data_facts. The origin_class and
-- derivation CHECKs below are therefore BYTE-IDENTICAL to 258's and 267's, asserted by an anti-drift test
-- (src/__tests__/contracts-market-series-migration.test.mjs), never hand-copied.
--
-- THE TWO COLUMNS THE ENVELOPE DOES NOT OWN. series_key (this table's own identity, analogous to
-- emission_factors' scope/mode columns) and label (the display name a reader sees, analogous to
-- published_price_statistics.label). Both NOT NULL — a market_series row without an identity or a label
-- is not a row worth storing, unlike the envelope's own columns, which stay nullable (additive convention,
-- same reasoning 267's header gives: nullable/backfill/NOT NULL are separately-reviewed steps, and this
-- is a fresh empty table so there is no legacy population to protect — the envelope module's renderer
-- simply has no NOT NULL mode, by design, per its own header note on why one generalised function does not
-- thread a NOT NULL flag through every caller).
--
-- KEYING. UNIQUE(series_key, reference_period) is the idempotency key every producer upserts against
-- (WO-16 step 1: "idempotent upsert"). It is NOT part of the envelope render (renderEnvelopeDDL emits
-- column DDL only, never multi-column constraints) and is hand-written here, same posture as the
-- series_key format CHECK below — neither is the origin_class/derivation CHECK shape the executor brief
-- says must never be hand-written.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   NO seed rows. NO producer wiring. NO change to published_price_statistics, regional_data_facts,
--   state_cost_facts or intelligence_items (additive-only, one new table).
--   NO FK from source_key to a specific pre-populated public.data_sources row beyond the FK constraint
--   itself (inherited from the envelope render, same as regional_data_facts).
--
-- SOURCE REGISTRATION, CLOSED BY THE COORDINATOR (2026-08-30). The WO-16 lane, whose write set excluded
-- src/lib/contracts/source-licence.mjs, correctly reported source_key 'ec_weekly_oil_bulletin' as an
-- un-silent gap that would fail the FK closed (23503) on any --apply write. The coordinator closed it
-- rather than landing a producer that could never run: the licence was verified against TWO primary
-- sources on 2026-08-30 (the bulletin page carries no dataset-specific copyright notice; the Commission
-- legal notice licenses Commission-owned content CC BY 4.0 under Decision 2011/833/EU, reuse permitted
-- with credit given and changes indicated), the register entry was added to source-licence.mjs, and
-- migration 258's data_source_seed block was REGENERATED through its own generator — the sanctioned
-- flow that file's header names ("committing the regenerated diff is how a register change ships").
-- The FK therefore resolves; the producer remains kill-switched off, which is a separate gate.
--
-- POST-APPLY PROOF (run these; every count is a live number, not [PLAN-STATED]):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'market_series';                                                -- 16 rows
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.market_series'::regclass AND contype = 'u';                -- 1 row
--   SELECT count(*) FROM public.market_series;                                            -- 0 (schema only)
--   INSERT ... origin_class = 'not-a-real-value' ON public.market_series                  -- must FAIL
--     (23514 check_violation) on market_series_origin_class_check.
--
-- DDL IS GENERATED. scripts/gen/migration-268-market-series.mjs splices the GENERATED block below from
-- src/lib/contracts/provenance-envelope.mjs renderEnvelopeDDL(); do not hand-edit inside the markers.
--
-- Two-track policy (CLAUDE.md standing rule 3): schema DDL applies via the sanctioned lane BEFORE the
-- dependent producer code merges. This migration is schema-only — additive, no data write, no dependency
-- on the producer — so it is safe to apply as soon as it is reviewed; the EU Weekly Oil Bulletin producer
-- ships kill-switched off in the same PR and stays off until an operator arms it.

-- ── market_series: identity columns + idempotency key ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_key  text NOT NULL,
  label       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_series_series_key_format_check
    CHECK (series_key ~ '^[a-z0-9]+(?:[:_-][a-z0-9]+)*$')
);

COMMENT ON TABLE public.market_series IS
  'WO-16 time-series spine: one row per published observation of one named series for one reference '
  'period. series_key namespaces by producer (e.g. eu-oil-bulletin:automotive-diesel). Feeds '
  'published_price_statistics via a separate refresher (WO-16.2 ruling, option a); does not replace it.';

COMMENT ON COLUMN public.market_series.series_key IS
  'Stable identity of the series within its producer namespace, e.g. "eu-oil-bulletin:automotive-diesel". '
  'Lower-case, colon/underscore/hyphen-separated segments (format CHECK). Registered in '
  'src/lib/market/series-registry.mjs alongside its source and cadence.';

COMMENT ON COLUMN public.market_series.label IS
  'Display name for this series, e.g. "Automotive diesel (EU-27 average, before taxes)". Not unique by '
  'itself — series_key is the identity; label is what a reader sees.';

-- ── the envelope (WO-12 shape, generated) ───────────────────────────────────────────────────────────
${block("market_series_envelope")}

-- ── idempotency key + lookups ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.market_series
  ADD CONSTRAINT market_series_series_key_reference_period_key UNIQUE (series_key, reference_period);

CREATE INDEX IF NOT EXISTS market_series_lookup_idx
  ON public.market_series (series_key, reference_period DESC);
CREATE INDEX IF NOT EXISTS market_series_source_idx
  ON public.market_series (source_key) WHERE source_key IS NOT NULL;

-- ── RLS and grants ───────────────────────────────────────────────────────────────────────────────────
-- Same posture as migration 258's reference tables: read-only to authenticated, no INSERT/UPDATE/DELETE
-- policy (writes arrive through the service role via the guarded path, scripts/lib/db.mjs).
ALTER TABLE public.market_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_series_read ON public.market_series;
CREATE POLICY market_series_read ON public.market_series FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.market_series TO authenticated;

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_cols   int;
  n_unique int;
  n_rows   int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'market_series';
  SELECT count(*) INTO n_unique FROM pg_constraint
    WHERE conrelid = 'public.market_series'::regclass AND contype = 'u';
  SELECT count(*) INTO n_rows FROM public.market_series;

  IF n_cols <> 16 THEN
    RAISE EXCEPTION 'ABORT: market_series has % columns, expected 16 (5 identity + 11 envelope)', n_cols;
  END IF;
  IF n_unique <> 1 THEN
    RAISE EXCEPTION 'ABORT: market_series does not carry exactly one UNIQUE constraint (found %)', n_unique;
  END IF;
  IF n_rows <> 0 THEN
    RAISE EXCEPTION 'ABORT: market_series is not empty (% rows) — this migration must ship schema-only', n_rows;
  END IF;

  RAISE NOTICE 'migration 268 OK: market_series created, 16 columns, UNIQUE(series_key, reference_period), 0 rows (schema only)';
END $$;
`;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "..", "supabase", "migrations", "268_market_series.sql");

if (process.argv[1] && process.argv[1].endsWith("migration-268-market-series.mjs")) {
  writeFileSync(target, renderMigration(), "utf8");
  console.log(`wrote ${target}`);
}
