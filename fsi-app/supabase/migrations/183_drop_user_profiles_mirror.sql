-- Migration 183: drop the user_profiles mirror table + its dual-write triggers/functions
--                (Wave-α Track E, dead-weight erase e6 — STEP 2 of 2; MUST apply AFTER 182).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- HARD DEPENDENCY: migration 182 MUST be applied first (it repoints the 3 RLS policy arms that read
-- user_profiles.is_platform_admin onto profiles.is_platform_admin). Applying 183 before 182 would
-- break moderation_reports_select/update_admin + post_promotions_select. This is mig-075 Phase 3.
--
-- Confirmed safe (2026-07-11): zero code readers/writers of user_profiles (mig-075 Phase 2 complete);
-- no inbound FK (pg_constraint probe = null); the ONLY remaining references were the 3 policy arms
-- (repointed by 182). profiles retains is_platform_admin with the identical value (mirror kept them in
-- sync; DB-4 §2b). Data note: profiles has the authoritative copy — user_profiles held 1 row, a subset
-- of the 2 profiles rows, all overlap columns agreeing; dropping it loses no unique data.

BEGIN;

-- The mirror trigger ON profiles (writes into user_profiles) must go before the table drop, since
-- profiles survives. Its two siblings (user_profiles_mirror_to_profiles, user_profiles_updated_at)
-- live ON user_profiles and fall via the table drop.
DROP TRIGGER IF EXISTS profiles_mirror_to_user_profiles ON public.profiles;

DROP TABLE IF EXISTS public.user_profiles CASCADE;

-- Orphan mirror functions (both directions). update_updated_at() is SHARED — NOT dropped.
DROP FUNCTION IF EXISTS public._mirror_profiles_to_user_profiles() CASCADE;
DROP FUNCTION IF EXISTS public._mirror_user_profiles_to_profiles() CASCADE;

COMMIT;
