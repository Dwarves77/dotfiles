-- Migration 168 (Wave-α Track B5) — parent-gate the five aux tables so anon can't read rows that name a
-- quarantined / archived intelligence_item
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS change = break-risky class, ADR-011).
-- Authored, apply via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P2 provenance/moat; DB-1 TML-1/RLS-1; X.4):
--   `item_timelines`, `item_cross_references`, `item_disputes`, `item_supersessions`, `item_changelog`
--   each expose a SELECT policy `USING (true)` to role {public}. Since migration 157 tightened
--   `intelligence_items_read` to `provenance_status='verified' AND is_archived IS NOT TRUE`, the parent
--   items are hidden from anon — but these child rows still leak them: 689 timeline rows (+ xrefs /
--   disputes / supersessions / changelog) name items the items policy hides, disclosing the id, title
--   fragments, and existence of quarantined / archived intelligence.
--
-- FIX: replace each `_read` SELECT policy with a parent-gated one that MIRRORS the intelligence_items read
--   predicate — the row is visible only if its parent item(s) are `verified` AND not archived. Tables with
--   two item FKs (cross_references, supersessions) require BOTH endpoints to pass, so a row never reveals a
--   hidden item through its counterpart. The service_role key bypasses RLS (as it already does for
--   intelligence_items_read — admin surfaces read the full set unchanged); INSERT/UPDATE/DELETE policies
--   are untouched.
--
-- POST-APPLY PROOF (see track-b-proofs.md B5):
--   For each table, as the ANON client: count rows whose parent item is NOT (verified AND non-archived)
--   MUST be 0. Spot: the 689 previously-visible quarantined-parent timeline rows -> 0 visible to anon.
--   Service-role count of the same tables is UNCHANGED (bypass).
-- Reversible: rollbacks/168_aux_table_parent_gates_rollback.sql (restores USING(true)).

BEGIN;

-- ── item_timelines (parent = item_id) ───────────────────────────────────────
DROP POLICY IF EXISTS item_timelines_read ON public.item_timelines;
CREATE POLICY item_timelines_read
  ON public.item_timelines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_timelines.item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
  );

-- ── item_disputes (parent = item_id) ────────────────────────────────────────
DROP POLICY IF EXISTS item_disputes_read ON public.item_disputes;
CREATE POLICY item_disputes_read
  ON public.item_disputes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_disputes.item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
  );

-- ── item_changelog (parent = item_id) ───────────────────────────────────────
DROP POLICY IF EXISTS item_changelog_read ON public.item_changelog;
CREATE POLICY item_changelog_read
  ON public.item_changelog
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_changelog.item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
  );

-- ── item_cross_references (two FKs: source_item_id + target_item_id; require BOTH) ──
DROP POLICY IF EXISTS item_cross_references_read ON public.item_cross_references;
CREATE POLICY item_cross_references_read
  ON public.item_cross_references
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_cross_references.source_item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_cross_references.target_item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
  );

-- ── item_supersessions (two FKs: old_item_id + new_item_id; require BOTH) ────
DROP POLICY IF EXISTS item_supersessions_read ON public.item_supersessions;
CREATE POLICY item_supersessions_read
  ON public.item_supersessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_supersessions.old_item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
    AND EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = item_supersessions.new_item_id
        AND i.provenance_status = 'verified'
        AND i.is_archived IS NOT TRUE
    )
  );

COMMIT;
