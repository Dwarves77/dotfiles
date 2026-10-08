-- subject: Migration 363 (lane TOKEN-1, 2026-10-08): closes the public RPC exposure of the SECURITY DEFINER function public.capture_worker_fetch(uuid[]) by revoking EXECUTE from PUBLIC, anon and authenticated and granting it to service_role only; the self-check attacks the grant as anon and as authenticated; NOT APPLIED.
-- 363 -- capture_worker_fetch grants: service_role only (lane TOKEN-1, 2026-10-08).
--
-- NOT APPLIED. Authored by lane TOKEN-1; the coordinator's executor applies it (two-track policy, CLAUDE.md
-- standing rule 3: schema DDL applies via the Supabase CLI before any dependent code commits; nothing in src,
-- scripts, supabase/functions, triggers or cron calls this function, so no code depends on this migration).
--
-- WHY. [CONFIRMED by read-only audit, 2026-10-08] public.capture_worker_fetch(queue_ids uuid[]) (created by
-- migration 256, runbook-sanctioned by migration 254) is SECURITY DEFINER and had EXECUTE granted to anon,
-- authenticated and PUBLIC (the Supabase default for a function created in schema public). Any API caller could
-- therefore invoke it through /rest/v1/rpc and spend the capture path (it posts to the capture-worker edge function
-- with the vaulted anon key). Its only legitimate callers are the runbooks under docs/runbooks/fleet-charters,
-- which run it with the service role.
--
-- WHAT. REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role. Both statements
-- are idempotent. The function body is NOT touched (migration 256 owns it), so the vault read, the fail-loud on a
-- missing key and the F24 NET_EGRESS_SANCTIONED entry are unchanged. Reversible: re-GRANT to the roles revoked here.
--
-- NOTE ON HISTORY. The literal in migration 256's vault seed line (and the two ledger rows that recorded 256) is
-- the PUBLIC anon key. It is left as history by coordinator ruling; this migration neither rewrites 256 nor
-- rotates the key. Closing the grant is what removes the exposure, not hiding a public key.
--
-- SELF-CHECK (inside the migration transaction, rolled back, no data changed). Part A attacks the grant with a
-- REAL call: SET LOCAL ROLE anon, then authenticated, then PERFORM the function and require SQLSTATE 42501
-- (insufficient_privilege). The privilege check happens before the function body runs, so the denied call performs
-- no http egress. Part B proves the allowed side from the privilege catalog, NOT by calling the function as
-- service_role, because a successful call would perform the http_post: has_function_privilege('service_role') is
-- true and neither PUBLIC (aclexplode grantee 0), anon nor authenticated holds EXECUTE.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.capture_worker_fetch(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.capture_worker_fetch(uuid[]) does not exist (migration 256 creates it)';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.capture_worker_fetch(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_worker_fetch(uuid[]) TO service_role;

DO $$
DECLARE
  v_denied boolean;
BEGIN
  -- Part A: the attack, as anon and as authenticated, rolled back by a sentinel exception.
  BEGIN
    v_denied := false;
    SET LOCAL ROLE anon;
    BEGIN
      PERFORM public.capture_worker_fetch(ARRAY['00000000-0000-0000-0000-000000000000'::uuid]);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    RESET ROLE;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'ABORT: anon was able to call capture_worker_fetch';
    END IF;

    v_denied := false;
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.capture_worker_fetch(ARRAY['00000000-0000-0000-0000-000000000000'::uuid]);
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    RESET ROLE;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'ABORT: authenticated was able to call capture_worker_fetch';
    END IF;

    RAISE EXCEPTION 'token1_363_selfcheck_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'token1_363_selfcheck_rollback' THEN RAISE; END IF;
  END;

  -- Part B: the privilege catalog (service_role is not called: a successful call would perform the http egress).
  IF NOT has_function_privilege('service_role', 'public.capture_worker_fetch(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: service_role lost EXECUTE on capture_worker_fetch';
  END IF;
  IF has_function_privilege('anon', 'public.capture_worker_fetch(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: anon still holds EXECUTE on capture_worker_fetch';
  END IF;
  IF has_function_privilege('authenticated', 'public.capture_worker_fetch(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ABORT: authenticated still holds EXECUTE on capture_worker_fetch';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(p.proacl) a
     WHERE p.oid = 'public.capture_worker_fetch(uuid[])'::regprocedure
       AND a.grantee = 0
       AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ABORT: PUBLIC still holds EXECUTE on capture_worker_fetch';
  END IF;

  RAISE NOTICE 'migration 363 OK: capture_worker_fetch(uuid[]) EXECUTE held by service_role only; anon and authenticated refused with 42501 on a real call; PUBLIC holds none';
END $$;

COMMIT;
