-- 279 — intelligence_changes RLS enable + customer SELECT policy (lane CD, change-detection chain
-- repair, 2026-09-01). Number/filename reserved by the dispatch for a `sources` content-fingerprint
-- column; see the FILENAME NOTE below for why this migration does something else instead.
--
-- FILENAME NOTE — READ CODE FIRST FOUND THE FINGERPRINT WORK ALREADY DONE. The dispatch's Task 1 asked
-- for content-change.mjs's fingerprint to be wired into check-sources (a `sources` column to hold "the
-- last stored fingerprint per source", reserving this migration number for it). Reading the code before
-- writing anything (the dispatch's own instruction) found this already shipped, on this branch, before
-- this lane started: migration 161_sources_content_hash.sql already added
-- `sources.last_content_hash`/`last_content_changed_at`, and
-- `src/app/api/worker/check-sources/route.ts` (commit cd9b63df, "real change detection in check-sources
-- — dormant, zero extra units") already imports `contentFingerprint`/`isContentChange` from
-- `content-change.mjs`, computes `changeDetected` against `source.last_content_hash`, and writes a REAL
-- (non-hardcoded) `monitoring_queue.change_detected`. No new fingerprint column is added here — verified
-- rather than rebuilt; re-adding one under a different name would just fork the signal migration 161
-- already owns. This migration keeps the reserved 279 slot for the schema change Task 3 (the
-- customer-visible ChangedSinceStrip) actually needed.
--
-- WHAT THIS MIGRATION ACTUALLY DOES. Task 3 asked to "verify RLS allows customer reads of
-- intelligence_changes; if it does not, add SELECT policy in migration 279 mirroring migration 103's
-- live-parent gate." Verifying (not assuming) found something WORSE than "no SELECT policy": grepping
-- every migration file for `intelligence_changes` turns up exactly two hits —
-- `009_capture_undeclared_tables.sql` (the retroactive `CREATE TABLE IF NOT EXISTS`, capturing a table
-- that already existed live with 0 rows and an explicit note that its RLS state could not be verified
-- from the PostgREST access path at the time) and `049_perf_v2_indexes.sql` (a comment only). Neither
-- migration — nor any other in this tree — ever runs `ALTER TABLE intelligence_changes ENABLE ROW LEVEL
-- SECURITY` or defines a policy on it. That is not "customer reads are blocked"; it is "RLS is OFF, so
-- PostgREST's default schema grants apply with NO row filter at all" — the exact anon-writable-residue
-- shape migration 230 found and fixed for 8 other tables (`funded_pass_runlock`, `disposition_ledger`,
-- `mutation_leases`, `corpus_census`, `coverage_gap_candidates`, `coverage_gap_census_findings`,
-- `drain_worklist`, `claim_versions`). `intelligence_changes` was not on that audit's list and is fixed
-- here on the identical posture: ENABLE ROW LEVEL SECURITY + an explicit, intentional policy — narrower
-- than "RLS off", not a new restriction relative to what today's anon key can already read informally.
--
-- POLICY SHAPE — mirrors migration 103 (`intelligence_item_sections`) exactly, per the dispatch's own
-- instruction: a public SELECT gated on the parent item's `is_archived` flag, nothing more restrictive.
-- Customer reads of a live item's change history are the same shape 103 already grants for a live item's
-- structured content and 274 (`item_forward_events`) reuses for the same reason — content a customer
-- should see once the parent item is live, hidden once it is archived. No INSERT/UPDATE/DELETE policy is
-- added: service_role bypasses RLS by default (same note 103/274 record), and every current writer
-- (`src/lib/sources/reconcile.ts`'s `recordItemChange`/`recordSourceChangeTrigger`, reached only through
-- the worker-secret-gated `/api/worker/reconcile` route and, as of this lane's change, in-process from
-- `/api/worker/check-sources`) already writes through `getServiceSupabase()`. Omitting write policies only
-- CLOSES the anon-write hole RLS-off + default grants left open; it removes no legitimate write path.
--
-- ADDITIVE AND SAFE FOR READS on a 0-row-at-audit-time table (migration 009's own capture noted 0 rows for
-- this exact table): the policy is narrower than "no RLS" only in the `is_archived=true` case, which is
-- the identical posture every sibling table in this family already enforces, so no legitimate
-- customer-facing read (this lane's own ChangedSinceStrip included) is narrowed relative to what the anon
-- key could already read informally.
--
-- TWO-TRACK POLICY (CLAUDE.md standing rule 3): schema DDL, authored by lane CD, left UNAPPLIED. Applied
-- only by the coordinator, before ChangedSinceStrip's read-site reaches a live render — a render between
-- "code deployed" and "migration applied" reads intelligence_changes through the request-scoped client, so
-- ordering this migration before the coordinator promotes that code avoids a window where every row
-- appears blocked once RLS is enabled but the customer policy is not yet in place.
--
-- REVERSAL. `ALTER TABLE public.intelligence_changes DISABLE ROW LEVEL SECURITY;` (policy drops with the
-- table's RLS state; not shipped as a separate rollback file, matching 274/276's convention for this exact
-- migration shape — a 0-row table, no dependent object, no prior established rollback precedent for this
-- table).

BEGIN;

ALTER TABLE public.intelligence_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intelligence_changes_read ON public.intelligence_changes;
CREATE POLICY intelligence_changes_read ON public.intelligence_changes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.intelligence_items i
      WHERE i.id = intelligence_changes.item_id
        AND i.is_archived = false
    )
  );

-- Service-role bypass via the Supabase service key (no policy needed; RLS is bypassed for service_role by
-- default) — same note migrations 103/274 record for their own tables, unchanged here.

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rls_on boolean;
  n_pol  int;
BEGIN
  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'public.intelligence_changes'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: intelligence_changes does not have RLS enabled';
  END IF;

  SELECT count(*) INTO n_pol FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'intelligence_changes'
      AND policyname = 'intelligence_changes_read';
  IF n_pol <> 1 THEN
    RAISE EXCEPTION 'ABORT: intelligence_changes_read policy missing (found %)', n_pol;
  END IF;

  RAISE NOTICE 'migration 279 OK: intelligence_changes RLS enabled, public SELECT policy mirroring migration 103 in place';
END $$;

COMMIT;
