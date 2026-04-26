-- ════════════════════════════════════════════════════════════════════
-- 008 — Platform admin flag on public.profiles
--
-- Adds is_platform_admin to the existing public.profiles table (created
-- in 001_schema.sql, extended in 007_community_layer.sql). NOT creating
-- a new profiles table — surface check before running confirmed it
-- already exists with 1 row 1:1 with auth.users.
--
-- All statements are idempotent (IF NOT EXISTS, OR REPLACE, ON CONFLICT
-- DO NOTHING, DROP IF EXISTS) so this can re-run safely.
--
-- Apply via:    node supabase/seed/apply-008.mjs
-- ════════════════════════════════════════════════════════════════════

-- 1. Add the column. Default false; backfilled below.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- 2. Trigger: ensure a profile row is auto-created when auth.users is
--    inserted, with id matching auth.users.id. Idempotent CREATE OR
--    REPLACE on the function + DROP+CREATE on the trigger.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Backfill: insert profile rows for any existing auth.users that
--    don't have one. No-op safety net — currently 1:1 with auth.users.
INSERT INTO public.profiles (id, email, display_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  'viewer'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4. RLS: ensure enabled, then add row-owner SELECT policy. Existing
--    policies from 002_rls.sql / 007 stay in place — this only ADDs.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- 5. Internal-account seed.
--    Fill the email list before running the COMMIT. Listed emails get
--    is_platform_admin = true. Anyone not listed stays false.
--
--    Run this AFTER the migration above succeeds.
--
-- UPDATE public.profiles
--   SET is_platform_admin = true
--   WHERE email IN (
--     'TEAM_EMAIL_1@example.com',
--     'TEAM_EMAIL_2@example.com'
--   );
