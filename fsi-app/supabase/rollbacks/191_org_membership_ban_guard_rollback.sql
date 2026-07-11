-- ROLLBACK for 191_org_membership_ban_guard.sql
-- Removes the DB-layer ban guard trigger + function. The two app-layer checks
-- (accept_invitation guard from migration 156; members-route PUT add-by-email
-- check) remain in force after rollback — the DB backstop is what disappears.

BEGIN;

DROP TRIGGER IF EXISTS org_memberships_ban_guard_trigger ON public.org_memberships;
DROP FUNCTION IF EXISTS public.org_memberships_ban_guard();

COMMIT;
