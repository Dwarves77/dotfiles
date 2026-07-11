-- 191_org_membership_ban_guard.sql
--
-- Wave-α Track D item d2 (correction-plan D3; master-gap-register P2 community
-- pre-adoption set, 2026-07-11). AUTHORED-NOT-APPLIED — apply rides the operator
-- DDL window.
--
-- WHY: the ban re-join block existed at TWO app-layer chokes only:
--   * accept_invitation() RPC (migration 156) — covers the invitation-accept path.
--   * members-route PUT add-by-email app-side check (route.ts:622-640, service role).
-- But org_memberships has a user-JWT INSERT policy (membership_write_admin: org
-- owner/admin may insert), and admin/users + provision-personal-workspace insert
-- via service role. An org admin inserting a membership row directly through
-- PostgREST (or any future code path that forgets the check) re-adds a banned
-- account with no error. Ban enforcement belongs at the TABLE, not per-caller.
--
-- FIX: BEFORE INSERT (and UPDATE OF user_id/org_id — an UPDATE that re-points a
-- membership at a banned user is the same re-join) trigger on org_memberships
-- raises 42501 when (org_id, user_id) has a ban row. The guard function is
-- SECURITY DEFINER because org_member_bans SELECT is owner/admin-scoped: an
-- INVOKER guard would read 0 rows under a non-admin caller's RLS and silently
-- pass — the exact F10 silent-no-op class migration 190 fixes for counters.
-- search_path pinned per the mig-160 convention.
--
-- Covers every writer: service-role inserts (triggers fire regardless of RLS
-- bypass), user-JWT RLS-path inserts, accept_invitation (its own guard remains —
-- friendlier error text — and this trigger backstops it).
--
-- Reversible: supabase/rollbacks/191_org_membership_ban_guard_rollback.sql
-- (DROP TRIGGER + DROP FUNCTION; the two app-layer checks remain).

BEGIN;

CREATE OR REPLACE FUNCTION public.org_memberships_ban_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.org_member_bans b
    WHERE b.org_id = NEW.org_id
      AND b.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'This account is banned from the workspace (org-scoped ban; lift the ban before re-adding)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.org_memberships_ban_guard() IS
  'DB-layer half of the org-scoped ban re-join block (migration 191, Wave-α Track D d2). Raises 42501 on any org_memberships INSERT (or user_id/org_id UPDATE) matching an org_member_bans row. SECURITY DEFINER so the ban lookup is not blinded by the owner/admin-scoped SELECT policy on org_member_bans. App-layer checks (accept_invitation guard from mig 156; members-route PUT check) remain as friendlier-error front doors; this trigger is the backstop no caller can skip.';

DROP TRIGGER IF EXISTS org_memberships_ban_guard_trigger ON public.org_memberships;
CREATE TRIGGER org_memberships_ban_guard_trigger
  BEFORE INSERT OR UPDATE OF user_id, org_id ON public.org_memberships
  FOR EACH ROW EXECUTE FUNCTION public.org_memberships_ban_guard();

COMMIT;
