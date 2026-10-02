-- subject: Migration 342 (lane R6-8, 2026-10-01). AUTHOR-ONLY, NOT YET APPLIED, rides the
-- coordinator's own Supabase CLI/MCP apply (standing rule 3: schema DDL applies via the coordinator
-- before the dependent code commits). Fixes the live violation F64 (rls-admin-gate-class) found
-- against migration 043 (security_advisor_fixes): canonical_source_candidates_admin_read and
-- canonical_source_candidates_admin_write gate on org_memberships role-membership (owner/admin of
-- ANY org) instead of profiles.is_platform_admin, the exact shape migration 048 shipped for
-- integrity_flags/holdings_quality and migration 249 fixed. Operator ruling 2026-10-01, verbatim:
-- "fixed, not worked around" -- this migration is the fix, not a dated allowlist exception.
--
-- Repoints both policies to profiles.is_platform_admin, matching migration 249's own pattern exactly
-- (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)).
-- Idempotent by construction (DROP POLICY IF EXISTS then CREATE POLICY, same idiom as 048/249/257).
-- Reversible (restore the prior org_memberships-based policies from migration 043's text).
--
-- Precondition: canonical_source_candidates must exist and already carry RLS (migration 043 enables
-- it in the same file) -- if either is missing, something upstream of this migration's assumptions
-- has changed and it should not proceed blind.
--
-- Post-check: re-reads pg_policy for the two policy names and asserts the new definition's qual
-- text references profiles.is_platform_admin and no longer references org_memberships, the same
-- shape rls-credential-parity-style audits use elsewhere in this corpus (migration 257).
--
-- APPLIED-PENDING. Applier: the coordinator (this lane has no DB credentials in its worktree).
--
-- Once applied, remove this file's companion dated note: F64's ADMIN_GATE_PREEXISTING_ALLOWLIST entry
-- for these two policy names is removed in the same commit as this migration file (see
-- F64-rls-admin-gate-class.mjs's header and this lane's session-log addendum), since the live
-- violation this migration fixes is the reason that entry existed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'canonical_source_candidates'
  ) THEN
    RAISE EXCEPTION 'ABORT: public.canonical_source_candidates does not exist -- this migration presupposes migration 043';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'canonical_source_candidates' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'ABORT: public.canonical_source_candidates does not have RLS enabled -- this migration presupposes migration 043''s ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS "canonical_source_candidates_admin_read" ON public.canonical_source_candidates;
CREATE POLICY "canonical_source_candidates_admin_read"
  ON public.canonical_source_candidates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  );

DROP POLICY IF EXISTS "canonical_source_candidates_admin_write" ON public.canonical_source_candidates;
CREATE POLICY "canonical_source_candidates_admin_write"
  ON public.canonical_source_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  );

COMMENT ON TABLE public.canonical_source_candidates IS
  'Canonical-source discovery candidates. RLS-gated to platform admins via profiles.is_platform_admin (migration 342, fixing migration 043''s org_memberships-based gate). Service role bypasses for the discovery worker.';

-- Post-check: the two policies now read is_platform_admin and no longer read org_memberships.
DO $$
DECLARE
  bad record;
  n int := 0;
BEGIN
  FOR bad IN
    SELECT pol.polname, pol.qual::text AS qual_text, pol.with_check::text AS with_check_text
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relname = 'canonical_source_candidates'
      AND pol.polname IN ('canonical_source_candidates_admin_read', 'canonical_source_candidates_admin_write')
  LOOP
    IF bad.qual_text LIKE '%org_memberships%' OR COALESCE(bad.with_check_text, '') LIKE '%org_memberships%' THEN
      RAISE NOTICE 'STILL BAD: % still references org_memberships', bad.polname;
      n := n + 1;
    END IF;
    IF bad.qual_text NOT LIKE '%is_platform_admin%' AND COALESCE(bad.with_check_text, '') NOT LIKE '%is_platform_admin%' THEN
      RAISE NOTICE 'STILL BAD: % does not reference is_platform_admin', bad.polname;
      n := n + 1;
    END IF;
  END LOOP;
  IF n > 0 THEN
    RAISE EXCEPTION 'POST-CHECK ABORT: % canonical_source_candidates admin polic(y/ies) still wrong', n;
  END IF;
  RAISE NOTICE 'OK: canonical_source_candidates admin policies now gate on profiles.is_platform_admin, not org_memberships';
END $$;
