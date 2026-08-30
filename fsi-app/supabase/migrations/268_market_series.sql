-- 268 — market_series: the WO-16 time-series spine (2026-08-30).
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
-- >>> GENERATED: market_series_envelope >>>
ALTER TABLE public.market_series
  ADD COLUMN IF NOT EXISTS value_numeric numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS derivation text,
  ADD COLUMN IF NOT EXISTS origin_class text,
  ADD COLUMN IF NOT EXISTS source_key text REFERENCES public.data_sources(source_key),
  ADD COLUMN IF NOT EXISTS source_ref text,
  ADD COLUMN IF NOT EXISTS n_observations integer,
  ADD COLUMN IF NOT EXISTS method_version text,
  ADD COLUMN IF NOT EXISTS as_at_date date,
  ADD COLUMN IF NOT EXISTS reference_period text;

ALTER TABLE public.market_series ADD CONSTRAINT market_series_derivation_check CHECK (derivation IN ('statutory_fixed', 'statutory_formula', 'observed', 'transacted_index', 'assessed', 'calculated', 'interpolated', 'modelled', 'estimated'));

ALTER TABLE public.market_series ADD CONSTRAINT market_series_origin_class_check CHECK (origin_class IN ('community', 'community-corroborated', 'modelled', 'derived', 'partner', 'verified', 'official'));

ALTER TABLE public.market_series ADD CONSTRAINT market_series_n_observations_positive_check CHECK (n_observations IS NULL OR n_observations > 0);

COMMENT ON COLUMN public.market_series.value_numeric IS 'The number itself, decomposed out of a legacy free-text display column. NULL means this row has not been re-keyed through the envelope yet; a legacy text column (where one exists on the table) remains the display source until it is.';

COMMENT ON COLUMN public.market_series.unit IS 'Unit of value_numeric (e.g. "EUR/tonne", "index_points", "USD/hour"). Required to interpret value_numeric; a populated value_numeric with a NULL unit is a malformed envelope, not a valid one — enforced at the write path (this migration does not add a DB-level co-nullability CHECK, so a later hardening pass may).';

COMMENT ON COLUMN public.market_series.currency IS 'ISO 4217 currency code, where `unit` denotes a monetary rate. NULL for a non-monetary fact.';

COMMENT ON COLUMN public.market_series.derivation IS 'How value_numeric was produced (IOSCO PD391 2.3(a)): statutory_fixed | statutory_formula | observed | transacted_index | assessed | calculated | interpolated | modelled | estimated. Same 9-value vocabulary as emission_factors.derivation (migration 258), owned by src/lib/contracts/envelope.mjs DERIVATION — this column never defines a second one.';

COMMENT ON COLUMN public.market_series.origin_class IS 'Where the content came from (spec 00 §3.6): community | community-corroborated | modelled | derived | partner | verified | official. Same 7-value vocabulary as emission_factors.origin_class (migration 258), owned by src/lib/contracts/vocabularies.mjs ORIGIN_CLASS. Nullable here: the vocabulary is NOT widened for pre-existing rows (operator ruling, Addendum 26) — a row this migration cannot confidently classify stays NULL, documented as pre-vocabulary, rather than being forced into the weakest class it might not deserve.';

COMMENT ON COLUMN public.market_series.source_key IS 'The licence-cleared external dataset this value came from, joined through the SAME licence register emission_factors.source_key already uses (public.data_sources / licence_clear_sources). Deliberately not the `sources` table other columns on this row may already reference — that FK is the trust-tier register for editorial content, a different question from which redistributable dataset supplied a number.';

COMMENT ON COLUMN public.market_series.source_ref IS 'The table, row, page or series id within the source, so a reader can check the figure without re-deriving it.';

COMMENT ON COLUMN public.market_series.n_observations IS 'Sample size behind an aggregated figure, where the derivation is an aggregate. Governs significant-figure rounding at render (see envelope.mjs significantFigures()).';

COMMENT ON COLUMN public.market_series.method_version IS 'Version tag of the method that produced value_numeric, when derivation is calculated/modelled/estimated. Lets a later method change be told apart from a data change in the same series.';

COMMENT ON COLUMN public.market_series.as_at_date IS 'When the source asserted this value (not when we ingested it, not when the underlying event occurred — envelope.mjs''s as-of triple keeps those three questions separate).';

COMMENT ON COLUMN public.market_series.reference_period IS 'The period value_numeric describes (e.g. "2026-Q2", "2026-07"), for a fact that is a period aggregate rather than a point-in-time observation.';
-- <<< END GENERATED: market_series_envelope <<<

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
