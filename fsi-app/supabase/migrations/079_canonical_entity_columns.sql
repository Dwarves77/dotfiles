-- Migration 079 — Canonical-entity columns on intelligence_items
--
-- Date: 2026-05-16
-- Workstream: Sprint 1 Phase 4, RC-9 (canonical-entity dedup)
-- Pre-work: docs/sprint-1/phase-2-dedup-plan.md
--
-- Numbering note: this branch sits behind PR #117 which also claims 078.
-- If #117 merges first, this file's number is correct. If sprint-1 lands
-- first, a numerical gap (077 -> 079) exists until #117 merges; apply-
-- pending.mjs handles gaps cleanly because it sorts by version number.
--
-- Background
-- ----------
-- Chrome audit RC-9 confirmed: three LL97 records, three EPA Phase 3
-- records (audit said 4; live introspection found 3), one EU Automotive
-- (audit said 2; live found 1), two Norway Fjords, two Matrix Hudson.
-- Operator-confirmed counts in docs/sprint-1/phase-2-dedup-plan.md.
--
-- Root cause: no canonical-entity key on intelligence_items. The only
-- UNIQUE is on legacy_id (per migration 071 comment), which most rows
-- do not have. Three records describing the same regulation get three
-- different severities because three classifier runs see three
-- different stub bodies.
--
-- This migration:
--   1. Adds instrument_type TEXT NULL with CHECK on the 15-value
--      operator-approved enum (Phase 2 § 6).
--   2. Adds instrument_identifier TEXT NULL with no shape constraint
--      (free-text; format varies by instrument_type per the picking
--      rule in Phase 2 § 7).
--   3. Adds partial unique index intelligence_items_canonical_key_idx
--      on (jurisdiction_iso, instrument_type, instrument_identifier)
--      WHERE instrument_identifier IS NOT NULL. The partial WHERE
--      allows existing rows with NULL identifiers to coexist until
--      Phase 5 backfills.
--
-- Reversibility
-- -------------
-- Drop the unique index, then drop the columns. The columns are
-- nullable; existing rows are unaffected by their addition.
--
-- Phase 5 (data migration) follows this; populates the new columns
-- + runs the dedup transactions per cluster.

BEGIN;

-- 1. instrument_type column with closed-vocab CHECK
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS instrument_type TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'intelligence_items_instrument_type_check'
      AND conrelid = 'public.intelligence_items'::regclass
  ) THEN
    ALTER TABLE public.intelligence_items
      ADD CONSTRAINT intelligence_items_instrument_type_check
      CHECK (
        instrument_type IS NULL
        OR instrument_type IN (
          'local_law',
          'state_statute',
          'national_regulation',
          'federal_statute',
          'federal_rule',
          'federal_executive_order',
          'eu_regulation',
          'eu_directive',
          'municipal_ordinance',
          'agency_guidance',
          'court_decision',
          'industry_standard',
          'market_signal',
          'research_item',
          'voluntary_initiative'
        )
      );

    COMMENT ON CONSTRAINT intelligence_items_instrument_type_check
      ON public.intelligence_items IS
      'Closed-vocabulary enum of 15 instrument types per docs/sprint-1/phase-2-dedup-plan.md § 6 (operator-approved). NULL allowed because regional_data/tool/technology/innovation item types do not carry an instrument identity. Combined with jurisdiction_iso + instrument_identifier in the partial unique index, this forms the canonical-entity key that prevents future RC-9 duplicates.';
  END IF;
END $$;

COMMENT ON COLUMN public.intelligence_items.instrument_type IS
  'Canonical instrument type per the 15-value closed vocabulary. Populated by classifier-item-type at ingest (Phase 6) and backfilled for existing regulation-style rows in Phase 5. NULL for non-regulatory items (regional_data, tool, technology, innovation).';

-- 2. instrument_identifier column (free-text; no shape constraint)
ALTER TABLE public.intelligence_items
  ADD COLUMN IF NOT EXISTS instrument_identifier TEXT NULL;

COMMENT ON COLUMN public.intelligence_items.instrument_identifier IS
  'Free-text identifier for the canonical instrument. Picking rule per docs/sprint-1/phase-2-dedup-plan.md § 7: (1) authoritative public identifier (RIN, EU OJ citation, public law number, ISO standard number), (2) CFR/agency-publication citation, (3) court-decision citation per Bluebook, (4) lowercase kebab-case slug derived from the title scoped to the jurisdiction. NOT auto-normalized at write; the partial unique index throws on near-matches with different formatting and forces operator review.';

-- 3. Partial unique index forming the canonical-entity key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'intelligence_items_canonical_key_idx'
  ) THEN
    CREATE UNIQUE INDEX intelligence_items_canonical_key_idx
      ON public.intelligence_items
        (jurisdiction_iso, instrument_type, instrument_identifier)
      WHERE instrument_type IS NOT NULL AND instrument_identifier IS NOT NULL;
  END IF;
END $$;

COMMENT ON INDEX public.intelligence_items_canonical_key_idx IS
  'Canonical-entity unique key for RC-9 dedup prevention. Partial WHERE requires BOTH instrument_type AND instrument_identifier to be NOT NULL: PostgreSQL treats two NULLs in a unique key as distinct, so without the type check, rows like (US, NULL, ''cfr-40-part-60'') x 2 would BOTH be allowed and defeat the constraint during partial backfills or classifier edge cases. Non-regulatory items (regional_data, tool, technology, innovation) have both fields NULL and coexist freely; only regulatory rows with both fields populated are subject to the canonical-key contract. Phase 6 ingest computes the key before INSERT and UPDATEs existing rows on match.';

COMMIT;
