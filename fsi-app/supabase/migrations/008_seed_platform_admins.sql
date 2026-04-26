-- ════════════════════════════════════════════════════════════════════
-- 008_seed — Platform admin seed
--
-- Sets is_platform_admin = true for the listed internal accounts.
-- Run AFTER 008_platform_admin_profiles.sql succeeds.
--
-- Schema migration is intentionally generic (kept in 008_platform_admin
-- _profiles.sql). This file is the data seed — kept separate so the
-- schema can be re-run on a fresh DB without baking in personal info.
--
-- Apply via:    node supabase/seed/apply-008-seed.mjs
-- Idempotent:   re-running just re-asserts the flag (UPDATE WHERE).
-- ════════════════════════════════════════════════════════════════════

UPDATE public.profiles
SET is_platform_admin = true
WHERE email IN (
  'jasonlosh@hotmail.com'
);

-- Verification: print the affected rows.
-- Expected: 1 row with display_name = 'Jason' and is_platform_admin = true.
SELECT id, email, display_name, is_platform_admin
FROM public.profiles
WHERE is_platform_admin = true
ORDER BY email;
