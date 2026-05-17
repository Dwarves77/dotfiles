-- Migration 082 — Operator queue tables + rejected-token routing
--
-- Date: 2026-05-17
-- Workstream: Sprint 1 Phase 4b (RC-7 completion)
-- Pre-work: docs/sprint-1/phase-3-operator-decision.md (table specs)
--           docs/sprint-1/phase-4b-design.md (this migration)
-- Carryforward: PR #119 (Phase 4a) shipped the CASE + classifier helper;
--               this migration ships the queues + trigger wire-up.
--
-- Background
-- ----------
-- Migration 080 (PR #119) replaced _normalize_jurisdictions with a
-- TABLE(canonical, rejected) return signature so the trigger has a clean
-- contract for routing rejected tokens. In the 4a-only window, the
-- trigger discarded `rejected` because the destination tables didn't
-- exist. Migration 082 ships those tables, replaces the trigger to route
-- rejected tokens per _classify_jurisdiction_token, and populates
-- pending_jurisdiction_review with the existing ~83 flagged rows.
--
-- This migration:
--   1. CREATE TABLE ingest_rejections (RC-7 fragment audit log).
--   2. CREATE TABLE pending_jurisdiction_review (existing-row triage queue)
--      with FK on intelligence_items.id DEFERRABLE INITIALLY DEFERRED so
--      the BEFORE INSERT trigger can write here using NEW.id before the
--      intelligence_items row is materialized.
--   3. Partial unique index on pending_jurisdiction_review preventing
--      duplicate unresolved flags for the same (item, value, column).
--   4. RLS policies on both tables referencing profiles.is_platform_admin
--      per operator decision Q2 (NO Postgres role).
--   5. CREATE OR REPLACE _intelligence_items_normalize_jurisdictions to
--      route rejected tokens: continent/region_bucket/undefined_group ->
--      pending_jurisdiction_review; everything else -> ingest_rejections.
--      Marked SECURITY DEFINER so it can bypass RLS on the queue tables
--      while being invoked by users whose RLS would otherwise deny.
--   6. Populate pending_jurisdiction_review with the existing flagged
--      rows (pre-flight: 107 token-rows across 72 distinct items).
--
-- Reversibility
-- -------------
-- DROP the two tables (CASCADE removes their FKs, indexes, RLS, the
-- DEFERRABLE constraint). Then re-CREATE OR REPLACE the trigger function
-- with migration 080's body (the rejected-discarding 4a version). The
-- canonical-entity columns from 079 and the CASE extension from 080 are
-- unaffected.
--
-- Phase 5 (data migration) follows this and re-normalizes existing rows
-- through the trigger, which will populate ingest_rejections naturally
-- for any tokens the populate-step below didn't catch (the populate-step
-- only covers continent/region_bucket/undefined_group; Phase 5 backfill
-- exercises the full classifier).
--
-- Phase 7 (triage UI) consumes both tables.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. ingest_rejections — RC-7 fragment audit log
--    Each ingest attempt that produces a rejected token writes one row
--    here. Multiple occurrences of the same token across ingests produce
--    multiple rows by design; the audit value is the event count.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE public.ingest_rejections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_value             text NOT NULL,
  rejection_reason      text NOT NULL,
  source_url            text,
  source_id             uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  ingest_attempted_at   timestamptz NOT NULL DEFAULT now(),
  triaged_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triaged_at            timestamptz,
  triage_action         text,
  triage_notes          text,
  CONSTRAINT ingest_rejections_valid_reason CHECK (
    rejection_reason IN ('below_granularity', 'non_geographic', 'institutional', 'unparseable')
  ),
  CONSTRAINT ingest_rejections_valid_triage_action CHECK (
    triage_action IS NULL OR triage_action IN ('discarded', 'reclassified', 'escalated')
  ),
  CONSTRAINT ingest_rejections_triage_consistency CHECK (
    -- Either fully untriaged or fully triaged; no partial state.
    (triage_action IS NULL AND triaged_by IS NULL AND triaged_at IS NULL) OR
    (triage_action IS NOT NULL AND triaged_by IS NOT NULL AND triaged_at IS NOT NULL)
  )
);

CREATE INDEX ingest_rejections_untriaged_idx
  ON public.ingest_rejections (ingest_attempted_at DESC)
  WHERE triaged_at IS NULL;

CREATE INDEX ingest_rejections_source_idx
  ON public.ingest_rejections (source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE public.ingest_rejections IS
  'RC-7 fragment audit log. Each row records one rejected jurisdiction token from an ingest attempt: hydrological features (CARSON_RIVER_WATERSHED), agency names (EPA, MINISTRY OF X), sub-jurisdictional fragments (BIHOR COUNTY), or unparseable strings. Populated by the BEFORE INSERT/UPDATE trigger on intelligence_items per migration 082. Read/Update gated to profiles.is_platform_admin via RLS. No DELETE policy (audit integrity). Phase 7 triage queue reads this for the ingest-rejection tab; operator triages each row to discarded / reclassified / escalated.';

COMMENT ON COLUMN public.ingest_rejections.rejection_reason IS
  'One of: below_granularity (county/sub-jurisdictional), non_geographic (hydrological/natural features), institutional (agency/ministry/court names), unparseable (default fallback). Set by _classify_jurisdiction_token at the trigger.';

COMMENT ON COLUMN public.ingest_rejections.triage_action IS
  'Operator decision: discarded (drop), reclassified (operator-mapped to canonical and item updated), escalated (needs further review). Null while untriaged. Triage_consistency CHECK enforces full triage state when set.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. pending_jurisdiction_review — existing-row triage queue
--    One row per (intelligence_item, flagged_token, source_column) tuple
--    that needs operator reclassification. The Phase 7 UI lets the
--    operator pick a canonical replacement OR discard the token.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE public.pending_jurisdiction_review (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_item_id  uuid NOT NULL,
  current_value         text NOT NULL,
  flagged_reason        text NOT NULL,
  source_column         text NOT NULL DEFAULT 'jurisdictions',
  flagged_at            timestamptz NOT NULL DEFAULT now(),
  resolved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at           timestamptz,
  resolution_value      text,
  CONSTRAINT pjr_valid_flagged_reason CHECK (
    flagged_reason IN ('continent', 'region_bucket', 'undefined_group')
  ),
  CONSTRAINT pjr_valid_source_column CHECK (
    source_column IN ('jurisdictions', 'jurisdiction_iso')
  ),
  CONSTRAINT pjr_resolution_consistency CHECK (
    -- Either fully unresolved or fully resolved (resolution_value may be
    -- NULL when operator chose 'discard' instead of 'replace with X').
    (resolved_at IS NULL AND resolved_by IS NULL AND resolution_value IS NULL) OR
    (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);

-- DEFERRABLE FK so BEFORE INSERT triggers on intelligence_items can write
-- here referencing NEW.id before the intelligence_items row is in the heap.
-- FK check fires at COMMIT, by which time the parent row exists.
ALTER TABLE public.pending_jurisdiction_review
  ADD CONSTRAINT pjr_intelligence_item_fkey
  FOREIGN KEY (intelligence_item_id)
  REFERENCES public.intelligence_items(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Prevent duplicate unresolved flags for the same (item, value, column).
-- Resolved rows do not occupy the unique slot; if the same token re-fires
-- after the operator resolved it, a new flag is created (legitimate signal
-- that ingest is producing the bad value again post-resolution).
CREATE UNIQUE INDEX pjr_unresolved_unique_idx
  ON public.pending_jurisdiction_review
    (intelligence_item_id, current_value, source_column)
  WHERE resolved_at IS NULL;

CREATE INDEX pjr_unresolved_idx
  ON public.pending_jurisdiction_review (flagged_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX pjr_item_idx
  ON public.pending_jurisdiction_review (intelligence_item_id);

COMMENT ON TABLE public.pending_jurisdiction_review IS
  'Existing-row jurisdiction reclassification queue. One row per (intelligence_item, flagged_token, source_column) tuple needing operator triage: continents (ASIA, EUROPE, AFRICA, ...), region buckets (LATAM, MEAF, APAC, EMEA, CARIBBEAN, AMERICAS, ...), undefined groups (DEVELOPING_COUNTRIES, G7, BRICS, ...). Populated initially by migration 082 with ~107 token-rows across ~72 items per Phase 3 operator decisions 2/3/4 (the 84-item estimate). Subsequently populated by the BEFORE INSERT/UPDATE trigger on intelligence_items. Read/Update gated to profiles.is_platform_admin via RLS. No DELETE policy (audit integrity). Phase 7 triage UI consumes this for the reclassification tab.';

COMMENT ON COLUMN public.pending_jurisdiction_review.source_column IS
  'Which column on intelligence_items the flagged token came from: jurisdictions or jurisdiction_iso. Phase 7 triage writes the chosen canonical back to the same column. Per OBS-4 in docs/sprint-1/followups.md.';

COMMENT ON COLUMN public.pending_jurisdiction_review.resolution_value IS
  'Operator-chosen canonical replacement, OR NULL if operator chose to discard the flagged value entirely. resolution_consistency CHECK allows NULL here when resolved_at and resolved_by are set.';

-- ──────────────────────────────────────────────────────────────────────
-- 3. RLS — both tables platform-admin-only (Q2 corrected: NO Postgres role)
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.ingest_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_jurisdiction_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY ingest_rejections_read_platform_admin
  ON public.ingest_rejections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY ingest_rejections_update_platform_admin
  ON public.ingest_rejections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY pjr_read_platform_admin
  ON public.pending_jurisdiction_review FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY pjr_update_platform_admin
  ON public.pending_jurisdiction_review FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- No INSERT policy: only the trigger function (SECURITY DEFINER) and
-- service_role write new rows. Default-deny on INSERT for all clients.
-- No DELETE policy: rows are never deleted; audit integrity.

-- ──────────────────────────────────────────────────────────────────────
-- 4. Replace _intelligence_items_normalize_jurisdictions to route rejected
--    SECURITY DEFINER so the trigger can INSERT into queue tables when
--    invoked by callers whose RLS would otherwise deny. search_path
--    pinned to prevent search-path injection.
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
BEGIN
  IF NEW.jurisdictions IS NOT NULL THEN
    SELECT * INTO norm_jur
      FROM public._normalize_jurisdictions(NEW.jurisdictions);
    NEW.jurisdictions := norm_jur.canonical;

    FOREACH t IN ARRAY norm_jur.rejected LOOP
      classification := public._classify_jurisdiction_token(t);
      IF classification IN ('continent', 'region_bucket', 'undefined_group') THEN
        -- pending_jurisdiction_review (operator reclassifies)
        -- ON CONFLICT DO NOTHING via partial unique index; repeat
        -- UPDATEs on the same row don't multiply queue entries.
        INSERT INTO public.pending_jurisdiction_review
          (intelligence_item_id, current_value, flagged_reason, source_column)
        VALUES (NEW.id, t, classification, 'jurisdictions')
        ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING;
      ELSE
        -- ingest_rejections (RC-7 fragment audit; each occurrence recorded)
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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._intelligence_items_normalize_jurisdictions() IS
  'BEFORE INSERT OR UPDATE trigger on intelligence_items. Normalizes jurisdictions + jurisdiction_iso via _normalize_jurisdictions(...) and routes any rejected tokens via _classify_jurisdiction_token: continent/region_bucket/undefined_group -> pending_jurisdiction_review; non_geographic/institutional/below_granularity/unparseable -> ingest_rejections. Marked SECURITY DEFINER so it can write to the queue tables when the calling user lacks INSERT permission via RLS. Migration 082 replaces the 4a-only version (from migration 080) that silently discarded rejected.';

-- ──────────────────────────────────────────────────────────────────────
-- 5. Populate pending_jurisdiction_review with the existing flagged rows.
--    Pre-flight (2026-05-17): 107 token-rows across 72 distinct items
--    in jurisdictions; jurisdiction_iso checked separately (likely 0).
--    The DEFERRABLE INITIALLY DEFERRED FK is irrelevant here because
--    parent rows already exist; FK passes at COMMIT regardless.
-- ──────────────────────────────────────────────────────────────────────

INSERT INTO public.pending_jurisdiction_review
  (intelligence_item_id, current_value, flagged_reason, source_column)
SELECT
  ii.id,
  j,
  public._classify_jurisdiction_token(j),
  'jurisdictions'
FROM public.intelligence_items ii,
     unnest(ii.jurisdictions) AS j
WHERE public._classify_jurisdiction_token(j) IN
  ('continent', 'region_bucket', 'undefined_group')
ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING;

INSERT INTO public.pending_jurisdiction_review
  (intelligence_item_id, current_value, flagged_reason, source_column)
SELECT
  ii.id,
  j,
  public._classify_jurisdiction_token(j),
  'jurisdiction_iso'
FROM public.intelligence_items ii,
     unnest(ii.jurisdiction_iso) AS j
WHERE public._classify_jurisdiction_token(j) IN
  ('continent', 'region_bucket', 'undefined_group')
ON CONFLICT (intelligence_item_id, current_value, source_column) WHERE resolved_at IS NULL DO NOTHING;

COMMIT;
