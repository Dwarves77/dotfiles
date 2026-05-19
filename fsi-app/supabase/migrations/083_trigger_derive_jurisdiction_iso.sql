-- Migration 083 — Trigger derive jurisdiction_iso from canonical jurisdictions
--
-- Date: 2026-05-18
-- Workstream: Sprint 2 Build 3 (closes OBS-24 / Critical #1)
-- Pre-work: docs/sprint-1/critical-investigations-2026-05-18.md (Critical #1)
--           docs/sprint-2/sprint-2-planning-2026-05-18.md (Build 3 scope)
--
-- Background
-- ----------
-- Critical #1 / proposed OBS-24 confirmed that the trigger function
-- _intelligence_items_normalize_jurisdictions (last replaced in migration
-- 082) does NOT derive jurisdiction_iso from canonical jurisdictions
-- tokens. The helper _normalize_jurisdictions only normalizes each input
-- column in isolation. Result: 451 rows have populated jurisdictions AND
-- empty jurisdiction_iso; 362 of those carry purely parseable canonical
-- tokens (alpha-2 codes or XX-YYY subdivision-only tokens) from which a
-- parent country code could be derived deterministically.
--
-- Phase 5 backfill faithfully mirrored this broken semantic; the gap is
-- in migration 080's trigger design, not the script. Critical #1's root
-- cause is option A (trigger semantic gap).
--
-- This migration
-- --------------
--   1. Adds _derive_jurisdiction_iso_from_canonical(TEXT[]) helper that
--      walks the canonical jurisdictions array and emits ISO 3166-1
--      alpha-2 parent codes: alpha-2 tokens pass through; XX-YYY (and
--      wider XX-YYYY) subdivision tokens contribute their parent XX.
--      Union and dedupe to a sorted TEXT[].
--   2. CREATE OR REPLACE _intelligence_items_normalize_jurisdictions to
--      add a derive step AFTER the existing column-wise normalization
--      and rejected-token routing. Defensive merge: only populates
--      jurisdiction_iso when the column is NULL or empty, preserving
--      any operator-curated values. Idempotent because re-firing on a
--      row whose jurisdiction_iso is already populated leaves the
--      column untouched.
--   3. One-shot backfill UPDATE against the live table for rows that
--      currently have populated jurisdictions and empty jurisdiction_iso.
--      The UPDATE fires the trigger, which exercises both the
--      column-wise normalization and the new derive step; the derive
--      step does the actual ISO population since jurisdiction_iso is
--      empty at update time.
--
-- Reversibility
-- -------------
-- DROP _derive_jurisdiction_iso_from_canonical; CREATE OR REPLACE
-- _intelligence_items_normalize_jurisdictions back to migration 082's
-- body. The backfill UPDATE itself is not reversed automatically (the
-- pre-backfill jurisdiction_iso values were empty arrays by definition,
-- so reversing would just restore the empty arrays; a snapshot is not
-- required).
--
-- Idempotency
-- -----------
-- Safe to re-run. The helper is CREATE OR REPLACE FUNCTION. The trigger
-- function is CREATE OR REPLACE FUNCTION. The backfill UPDATE filters on
-- empty jurisdiction_iso, so once a row has been populated by a prior
-- run, the UPDATE skips it. The derive step inside the trigger also
-- skips rows where jurisdiction_iso is already populated.
--
-- OBS coverage
-- ------------
-- - OBS-24 (proposed): CLOSED by this migration.
-- - OBS-13: orthogonal. Gate 7.2a all-rejected-jurisdictions rows remain
--   open; this migration does not touch the 6-row set with zero
--   parseable tokens, only the 362-row set with parseable canonical
--   jurisdictions and empty jurisdiction_iso.
-- - OBS-2, OBS-8: out of scope. ISO-3166-1/2 pass-through validation
--   gap is separate cleanup work; this migration's derive helper trusts
--   the canonical array's existing shape (which migration 080's CASE
--   plus the pass-through branches already enforce).
-- - OBS-5: derive step inside the trigger does NOT write to
--   ingest_rejections, so re-firing on UPDATEs does not pollute the
--   audit log. The derive step is a pure NEW assignment, no INSERTs.
--
-- DP compliance
-- -------------
-- - DP-1 (Single-Pane Operator Review): not applicable. This migration
--   has no operator-surface scope; it is a trigger semantic fix and a
--   one-shot data backfill. Downstream Phase 7 triage UI inherits the
--   correctly-populated jurisdiction_iso column for free.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Helper: derive ISO 3166-1 alpha-2 country codes from a canonical
--    jurisdictions array. Alpha-2 tokens (`US`, `CA`, `GB`) pass through.
--    Subdivision tokens (`US-PA`, `CA-ON`, `GB-ENG`) contribute the
--    parent alpha-2. Free-text canonical (`EU`, `GLOBAL`, `IMO`, `ICAO`,
--    `OECD`, `ASEAN`) does NOT contribute a country code (these are not
--    ISO 3166-1 entities) and is filtered out. Result is sorted-deduped.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._derive_jurisdiction_iso_from_canonical(
  canonical_jurisdictions TEXT[]
)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(iso ORDER BY iso)
      FROM (
        SELECT DISTINCT
          CASE
            WHEN tok ~ '^[A-Z]{2}$' THEN tok
            WHEN tok ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$' THEN split_part(tok, '-', 1)
            ELSE NULL
          END AS iso
        FROM unnest(COALESCE(canonical_jurisdictions, ARRAY[]::TEXT[])) AS tok
      ) AS derived
      WHERE iso IS NOT NULL
    ),
    ARRAY[]::TEXT[]
  );
$$;

COMMENT ON FUNCTION public._derive_jurisdiction_iso_from_canonical(TEXT[]) IS
  'Derive an ISO 3166-1 alpha-2 country code array from a canonical jurisdictions array produced by _normalize_jurisdictions. Alpha-2 tokens (US, CA, GB) pass through; subdivision tokens (US-PA, CA-ON, GB-ENG, US-NYC, AU-NSW) contribute the parent alpha-2 via split_part. Free-text canonical (EU, GLOBAL, IMO, ICAO, OECD, ASEAN) is filtered out because those are not ISO 3166-1 entities. Result is sorted and deduped via DISTINCT. Used by _intelligence_items_normalize_jurisdictions as the derive step that closes OBS-24 / Critical #1 (trigger semantic gap leaving 362 rows with empty jurisdiction_iso despite parseable canonical jurisdictions).';

-- ──────────────────────────────────────────────────────────────────────
-- 2. Trigger function: extend with derive step (defensive merge).
--    Body mirrors migration 082 verbatim, then appends the derive step
--    at the end. The derive step runs AFTER both column-wise
--    normalizations so it sees the canonicalized jurisdictions array,
--    and AFTER the rejected-token routing so the queue tables are
--    written as expected. Defensive merge: only populates
--    jurisdiction_iso when it is NULL or empty, preserving any
--    operator-curated values per the Critical #1 audit's defensive
--    recommendation.
-- ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._intelligence_items_normalize_jurisdictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  norm_jur RECORD;
  norm_iso RECORD;
  t TEXT;
  classification TEXT;
  derived TEXT[];
BEGIN
  IF NEW.jurisdictions IS NOT NULL THEN
    SELECT * INTO norm_jur
      FROM public._normalize_jurisdictions(NEW.jurisdictions);
    NEW.jurisdictions := norm_jur.canonical;

    FOREACH t IN ARRAY norm_jur.rejected LOOP
      classification := public._classify_jurisdiction_token(t);
      IF classification IN ('continent', 'region_bucket', 'undefined_group') THEN
        INSERT INTO public.pending_jurisdiction_review
          (intelligence_item_id, current_value, flagged_reason, source_column)
        VALUES (NEW.id, t, classification, 'jurisdictions')
        ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING;
      ELSE
        INSERT INTO public.ingest_rejections
          (raw_value, rejection_reason, source_url, source_id)
        VALUES (t, classification, NEW.source_url, NEW.source_id);
      END IF;
    END LOOP;
  END IF;

  IF NEW.jurisdiction_iso IS NOT NULL THEN
    SELECT * INTO norm_iso
      FROM public._normalize_jurisdictions(NEW.jurisdiction_iso);
    NEW.jurisdiction_iso := norm_iso.canonical;

    FOREACH t IN ARRAY norm_iso.rejected LOOP
      classification := public._classify_jurisdiction_token(t);
      IF classification IN ('continent', 'region_bucket', 'undefined_group') THEN
        INSERT INTO public.pending_jurisdiction_review
          (intelligence_item_id, current_value, flagged_reason, source_column)
        VALUES (NEW.id, t, classification, 'jurisdiction_iso')
        ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING;
      ELSE
        INSERT INTO public.ingest_rejections
          (raw_value, rejection_reason, source_url, source_id)
        VALUES (t, classification, NEW.source_url, NEW.source_id);
      END IF;
    END LOOP;
  END IF;

  -- Migration 083: derive jurisdiction_iso from canonical jurisdictions
  -- when the column is empty. Defensive merge preserves operator-curated
  -- values (per Critical #1 audit recommendation). Closes OBS-24.
  IF NEW.jurisdictions IS NOT NULL
     AND (NEW.jurisdiction_iso IS NULL OR cardinality(NEW.jurisdiction_iso) = 0)
  THEN
    derived := public._derive_jurisdiction_iso_from_canonical(NEW.jurisdictions);
    IF cardinality(derived) > 0 THEN
      NEW.jurisdiction_iso := derived;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._intelligence_items_normalize_jurisdictions() IS
  'BEFORE INSERT OR UPDATE trigger on intelligence_items. Normalizes jurisdictions and jurisdiction_iso via _normalize_jurisdictions(...) and routes any rejected tokens via _classify_jurisdiction_token: continent/region_bucket/undefined_group -> pending_jurisdiction_review; non_geographic/institutional/below_granularity/unparseable -> ingest_rejections. Migration 083 added a derive step: when jurisdiction_iso is empty, derive parent ISO 3166-1 alpha-2 codes from the canonical jurisdictions array via _derive_jurisdiction_iso_from_canonical. Defensive merge preserves operator-curated jurisdiction_iso values. Closes OBS-24 / Critical #1. Marked SECURITY DEFINER so it can write to the queue tables when the calling user lacks INSERT permission via RLS.';

-- ──────────────────────────────────────────────────────────────────────
-- 3. One-shot backfill. The trigger is enabled; firing the UPDATE
--    exercises the new derive step and populates jurisdiction_iso for
--    each row whose canonical jurisdictions carry parseable parent
--    codes. The UPDATE assignment of jurisdiction_iso to itself does
--    not change the column value (it remains NULL or empty array);
--    the trigger's BEFORE pass then runs the derive step and assigns
--    the derived array to NEW.jurisdiction_iso.
--
--    Idempotency: the filter restricts to rows where jurisdiction_iso
--    is currently NULL or empty, so a re-run after the first apply
--    matches zero rows.
-- ──────────────────────────────────────────────────────────────────────

UPDATE public.intelligence_items
SET jurisdiction_iso = public._derive_jurisdiction_iso_from_canonical(jurisdictions)
WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
  AND jurisdictions IS NOT NULL
  AND cardinality(jurisdictions) > 0;

COMMIT;
