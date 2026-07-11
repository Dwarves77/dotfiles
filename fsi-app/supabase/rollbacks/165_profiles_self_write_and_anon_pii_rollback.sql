-- Rollback for migration 165 — drop the self-write policies and restore anon's table-wide SELECT grant.
-- NOTE: reversing #2 re-exposes email/linkedin_sub/is_platform_admin to anon (the P1 #4 condition).

BEGIN;

DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;

-- Restore the pre-165 anon grant (table-wide SELECT, all columns).
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT ON public.profiles TO anon;

COMMIT;
