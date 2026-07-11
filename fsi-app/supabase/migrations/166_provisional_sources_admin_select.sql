-- Migration 166 (Wave-α Track B3) — restore an admin-scoped SELECT policy on provisional_sources
--
-- AUTHOR-ONLY / OPERATOR DDL WINDOW (RLS change = break-risky class, ADR-011).
-- Authored, apply via the DDL protocol — DO NOT apply inline.
--
-- WHY (master-gap-register P1 #2; DB-2 §2; DB-3 policies; X headline 3):
--   Migration 157 (security hardening) DROPPED `provisional_sources_read` (it was a permissive anon-read
--   policy, correctly removed). But provisional_sources was left with ONLY `_admin_write` (INSERT) and
--   `_admin_update` (UPDATE) policies — NO SELECT policy at all. The /admin provisional-review queue reads
--   the table with the ANON client (supabase-server.ts:344) which, deny-by-default under RLS, returns 0
--   rows AND the reader dropped `error` from the destructure — so 489+2 pending rows render as an EMPTY
--   queue on the only review surface, silently, since 2026-07-07.
--
-- FIX (defense-in-depth; the code half is the operative fix, this is the belt-and-braces read path):
--   An admin-scoped SELECT policy so a platform-admin authenticated session can also read the working set
--   directly (mirrors the 099 `source_tier_opinions_select_platform_admin` shape). The PRIMARY fix is the
--   code half in the SAME dispatch: fetchProvisionalSources() now uses the SERVICE client (bypasses RLS,
--   the correct credential for an admin-only working set) and CAPTURES `error` (kills the silent-swallow).
--   With the code on the service client this policy is not strictly required for the queue to populate, but
--   it removes the "no SELECT policy at all" gap and gives an authenticated-admin read path parity with the
--   existing INSERT/UPDATE admin policies.
--
-- POST-APPLY PROOF (see track-b-proofs.md B3):
--   * pg_policies shows provisional_sources_admin_read (SELECT).
--   * As a platform-admin authenticated session: SELECT count(*) FROM provisional_sources WHERE status IN
--     ('pending_review','needs_more_data') -> matches the service-role count (queue no longer empty).
--   * As anon: same SELECT -> 0 rows (anon read stays closed).
-- Reversible: rollbacks/166_provisional_sources_admin_select_rollback.sql.

BEGIN;

DROP POLICY IF EXISTS provisional_sources_admin_read ON public.provisional_sources;
CREATE POLICY provisional_sources_admin_read
  ON public.provisional_sources
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  );

COMMIT;
