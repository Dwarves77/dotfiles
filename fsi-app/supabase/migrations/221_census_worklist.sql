-- 221_census_worklist.sql
--
-- CENSUS WORKLIST (operator dispatch, 2026-07-19): the full-corpus gap census data layer. Session B (this
-- migration) owns the table; Session A (intake lane, Chrome) and Session C (discovery lane, fetch-light)
-- produce rows as they enumerate sources. One row per (source, document): a document the census has SEEN,
-- not yet a corpus item. Rows accumulate into docs/census/gap-census-2026-07.md at task boundaries.
--
-- REUSE-BEFORE-CONSTRUCTION (why this is a new table, not an extension of an existing one):
--   corpus_census (mig 212)          PRIMARY KEY intelligence_item_id, one row per EXISTING corpus item
--                                     (live + archived). Cannot represent a document with no item yet, which
--                                     is the entire point of a gap census. Does not serve.
--   coverage_gap_candidates (mig 214) a hand-curated, one-off RANKED pricing input (Session C, 2026-07-17).
--                                     Not a mechanical enumeration ledger; no lease discipline, no dryRun
--                                     disposition, no multi-lane producer model. Different purpose, different
--                                     lifecycle. Does not serve.
--   portal_link_candidates (mig 162/220) the closest structural precedent (source_id + url + status +
--                                     disposition_reason) but it is B1's LIVE INTAKE ledger, candidate straight
--                                     into the mint chokepoint. Coupling the census (a measurement pass, richer
--                                     disposition vocabulary, two producer lanes, cap-hit tracking) onto B1's
--                                     production ledger would conflate two different lifecycles. The SHAPE is
--                                     reused (source_id + canonical url + guarded status + disposition_reason
--                                     pattern); the table is new.
--
-- LEASE DISCIPLINE: reuses mutation_leases (mig 211) AS-IS. intelligence_item_id there is a bare uuid PK with
-- no foreign-key constraint (a generic leasable-key column, not scoped to intelligence_items); acquire/
-- heartbeat/release_mutation_lease work unchanged keyed on census_worklist.id. No schema change needed.
--
-- APPEND-ONLY: rows are never deleted (a census row is evidence the document was seen; erasing that would
-- corrupt the gap-measurement history). enumeration_status transitions are GUARDED (forward-only through the
-- defined ladder, with 'flagged' reachable from anywhere and one reset path back to 'discovered' so a
-- producing lane can re-submit a corrected row), malformed/incomplete rows are flagged back to the
-- producing lane's queue, never silently patched by a different lane. Identity columns (source_id,
-- document_url, lane, created_by, created_at) are immutable after insert.

BEGIN;

CREATE TABLE IF NOT EXISTS public.census_worklist (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- IDENTITY (immutable after insert; one row per source+document)
  source_id             uuid NOT NULL REFERENCES public.sources(id) ON DELETE RESTRICT,
  document_url          text NOT NULL,
  lane                  text NOT NULL CHECK (lane IN ('A', 'C')),
  created_by            text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- ENUMERATION
  shape_class           text CHECK (shape_class IN ('instrument_page', 'index_page', 'pdf_direct', 'feed_entry', 'unknown')),
  enumeration_status     text NOT NULL DEFAULT 'discovered'
                           CHECK (enumeration_status IN ('discovered', 'classified', 'dry_run_complete', 'reconciled', 'flagged')),
  cap_hit                boolean NOT NULL DEFAULT false,

  -- DRY-RUN DISPOSITION (the mint chokepoint's dryRun verdict on this document, per mint-dryrun-equivalence)
  dryrun_disposition    text CHECK (dryrun_disposition IN ('would_mint', 'dedup_hit', 'congruence_reject', 'invariant_reject', 'hold')),
  hold_reason           text,

  -- SURFACE TAGS (multi-tag; Community excluded, human-operated, outside machine intake per platform-intent)
  surface_tags          text[] NOT NULL DEFAULT '{}'
                           CHECK (surface_tags <@ ARRAY['regulations', 'operations', 'market_intel', 'research']::text[]),

  -- CROSS-SOURCE DEDUP (Task 2 standing duty; matchExistingSubject-style resolution across census rows)
  instrument_identifier text,
  resolved_into_id      uuid REFERENCES public.census_worklist(id) ON DELETE SET NULL,

  -- FLAG-BACK (malformed/incomplete rows, RD-6 shape: no flag without a reason)
  flagged_reason        text,
  flagged_at            timestamptz,

  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_id, document_url),
  CHECK ((flagged_reason IS NULL) = (flagged_at IS NULL)),
  CHECK ((dryrun_disposition = 'hold') = (hold_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS census_worklist_source_idx ON public.census_worklist (source_id);
CREATE INDEX IF NOT EXISTS census_worklist_status_idx ON public.census_worklist (enumeration_status) WHERE enumeration_status != 'reconciled';
CREATE INDEX IF NOT EXISTS census_worklist_lane_idx ON public.census_worklist (lane);
CREATE INDEX IF NOT EXISTS census_worklist_cap_hit_idx ON public.census_worklist (source_id) WHERE cap_hit = true;
CREATE INDEX IF NOT EXISTS census_worklist_flagged_idx ON public.census_worklist (lane) WHERE flagged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS census_worklist_resolved_idx ON public.census_worklist (resolved_into_id) WHERE resolved_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS census_worklist_surface_gin_idx ON public.census_worklist USING gin (surface_tags);

-- System-internal worklist: service role writes/reads it; no anon/authenticated policy.
ALTER TABLE public.census_worklist ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY: no DELETE, ever, by anyone (service role included). A census row is evidence a document was
-- seen; deleting it would corrupt the gap-measurement history the report is built from.
CREATE OR REPLACE FUNCTION public.census_worklist_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'census_worklist is APPEND-ONLY: DELETE is forbidden (gap-census data layer, 2026-07-19)';
END;
$$;

DROP TRIGGER IF EXISTS census_worklist_no_delete ON public.census_worklist;
CREATE TRIGGER census_worklist_no_delete
  BEFORE DELETE ON public.census_worklist
  FOR EACH ROW EXECUTE FUNCTION public.census_worklist_no_delete();

-- GUARDED UPDATE: identity columns are immutable after insert; enumeration_status only moves FORWARD through
-- the ladder (discovered < classified < dry_run_complete < reconciled), except 'flagged' is reachable from any
-- rank (malformed/incomplete rows flag back to the producing lane's queue at any point) and the one reset path
-- flagged -> discovered lets the producing lane re-submit a corrected row. Every other column is free to
-- update (dryrun_disposition, surface_tags, resolved_into_id, notes, flags, cap_hit, updated_at).
CREATE OR REPLACE FUNCTION public.census_worklist_guarded_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rank_old integer;
  rank_new integer;
BEGIN
  IF NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.document_url IS DISTINCT FROM OLD.document_url
     OR NEW.lane IS DISTINCT FROM OLD.lane
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'census_worklist identity columns (source_id, document_url, lane, created_by, created_at) are immutable after insert';
  END IF;

  IF NEW.enumeration_status IS DISTINCT FROM OLD.enumeration_status THEN
    rank_old := CASE OLD.enumeration_status
      WHEN 'discovered' THEN 1 WHEN 'classified' THEN 2 WHEN 'dry_run_complete' THEN 3
      WHEN 'reconciled' THEN 4 WHEN 'flagged' THEN 0 END;
    rank_new := CASE NEW.enumeration_status
      WHEN 'discovered' THEN 1 WHEN 'classified' THEN 2 WHEN 'dry_run_complete' THEN 3
      WHEN 'reconciled' THEN 4 WHEN 'flagged' THEN 0 END;

    IF NEW.enumeration_status = 'flagged' THEN
      NULL; -- flaggable from any rank
    ELSIF OLD.enumeration_status = 'flagged' AND NEW.enumeration_status = 'discovered' THEN
      NULL; -- the one reset path: producing lane re-submits a corrected row
    ELSIF rank_new > rank_old THEN
      NULL; -- forward progress through the ladder
    ELSE
      RAISE EXCEPTION 'census_worklist enumeration_status must move forward (discovered -> classified -> dry_run_complete -> reconciled), or to/from flagged: got % -> %', OLD.enumeration_status, NEW.enumeration_status;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS census_worklist_guarded_update ON public.census_worklist;
CREATE TRIGGER census_worklist_guarded_update
  BEFORE UPDATE ON public.census_worklist
  FOR EACH ROW EXECUTE FUNCTION public.census_worklist_guarded_update();

COMMENT ON TABLE public.census_worklist IS
  'Full-corpus gap census data layer (operator dispatch 2026-07-19). One row per (source, document) a census enumeration pass has seen, not yet a corpus item. Sessions A (intake) and C (discovery) produce rows; Session B owns the table + standing dedup/rollup/flag-back duties. Append-only (no DELETE); enumeration_status transitions guarded forward-only. Lease discipline via the existing mutation_leases table (mig 211), keyed on census_worklist.id.';
COMMENT ON COLUMN public.census_worklist.shape_class IS
  'Structural shape at discovery time, distinct from the eventual item_type/format classification: instrument_page (single document) | index_page (hub/register/portal listing many documents) | pdf_direct | feed_entry | unknown.';
COMMENT ON COLUMN public.census_worklist.dryrun_disposition IS
  'The mint chokepoint dryRun verdict on this document (mintIntelligenceItem dryRun:true, per F6/mint-dryrun-equivalence): would_mint | dedup_hit | congruence_reject | invariant_reject | hold (see hold_reason). NULL = not yet dry-run evaluated.';
COMMENT ON COLUMN public.census_worklist.surface_tags IS
  'Multi-tag: which of the four machine-addressable customer surfaces this document could serve (regulations/operations/market_intel/research). Community is excluded by design, human-operated, outside machine intake (caros-ledge-platform-intent).';
COMMENT ON COLUMN public.census_worklist.resolved_into_id IS
  'Cross-source dedup (Task 2 standing duty): set when the same instrument was enumerated at two registers and matchExistingSubject-style resolution collapses this row into the canonical one. NULL = not deduped / this row is canonical.';
COMMENT ON COLUMN public.census_worklist.cap_hit IS
  'True when the producing lane stopped this source''s enumeration at its per-source cap, a signal that more documents on this source may exist beyond what the census captured. Rolled up per-source in the gap-census report.';
COMMENT ON COLUMN public.census_worklist.flagged_reason IS
  'Set when a malformed or incomplete row is flagged back to the producing lane''s queue (never silently fixed by a different lane). Paired with flagged_at; enumeration_status moves to ''flagged'' at the same time.';

COMMIT;
