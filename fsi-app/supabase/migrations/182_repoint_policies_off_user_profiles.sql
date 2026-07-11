-- Migration 182: repoint the 3 RLS policy arms off user_profiles onto profiles.is_platform_admin
--                (Wave-α Track E, dead-weight erase e6 — STEP 1 of 2; MUST apply before 183).
--
-- STATUS: AUTHOR-ONLY — NOT APPLIED. Rides an operator DDL window. Do not apply inline.
-- Numbered 182 (180 views, 181 vendors; 164–179 reserved for Track B). MUST precede migration 183
-- (the user_profiles drop) — 183 depends on nothing referencing user_profiles.
--
-- Background: mig-075 Phase 2 (2026-05-15) migrated every CODE reader/writer off user_profiles onto
-- profiles; Phase 3 (drop the table) never landed because exactly 3 RLS policy arms still read
-- user_profiles.is_platform_admin (DB-4 F3, re-confirmed live 2026-07-11 via pg_policies):
--   1. moderation_reports_select   (SELECT)
--   2. moderation_reports_update_admin (UPDATE)
--   3. post_promotions_select      (SELECT)
-- profiles carries is_platform_admin (mig-075) with the SAME value via the live mirror (DB-4 §2b:
-- rows agree exactly). profiles is keyed by `id` = auth.uid() (user_profiles was keyed by `user_id`),
-- so the platform-admin EXISTS subquery changes `user_profiles up WHERE up.user_id = auth.uid()` to
-- `profiles up WHERE up.id = auth.uid()`. All non-admin arms are reproduced verbatim from the live
-- policy definitions captured 2026-07-11.

BEGIN;

-- 1. moderation_reports SELECT ------------------------------------------------------------------
DROP POLICY IF EXISTS moderation_reports_select ON public.moderation_reports;
CREATE POLICY moderation_reports_select ON public.moderation_reports FOR SELECT
USING (
  (reporter_user_id = auth.uid())
  OR ((target_kind = 'post') AND (EXISTS (
        SELECT 1 FROM community_posts p
          JOIN community_group_members m ON m.group_id = p.group_id
        WHERE p.id = moderation_reports.target_id
          AND m.user_id = auth.uid()
          AND m.role = ANY (ARRAY['admin','moderator']))))
  OR ((target_kind = 'group') AND (EXISTS (
        SELECT 1 FROM community_group_members m
        WHERE m.group_id = moderation_reports.target_id
          AND m.user_id = auth.uid()
          AND m.role = ANY (ARRAY['admin','moderator']))))
  OR (EXISTS (
        SELECT 1 FROM profiles up
        WHERE up.id = auth.uid() AND up.is_platform_admin = true))
);

-- 2. moderation_reports UPDATE (admin) ----------------------------------------------------------
DROP POLICY IF EXISTS moderation_reports_update_admin ON public.moderation_reports;
CREATE POLICY moderation_reports_update_admin ON public.moderation_reports FOR UPDATE
USING (
  (EXISTS (
        SELECT 1 FROM profiles up
        WHERE up.id = auth.uid() AND up.is_platform_admin = true))
  OR ((target_kind = 'post') AND (EXISTS (
        SELECT 1 FROM community_posts p
          JOIN community_group_members m ON m.group_id = p.group_id
        WHERE p.id = moderation_reports.target_id
          AND m.user_id = auth.uid()
          AND m.role = ANY (ARRAY['admin','moderator']))))
  OR ((target_kind = 'group') AND (EXISTS (
        SELECT 1 FROM community_group_members m
        WHERE m.group_id = moderation_reports.target_id
          AND m.user_id = auth.uid()
          AND m.role = ANY (ARRAY['admin','moderator']))))
)
WITH CHECK (
  (resolved_by_user_id IS NULL) OR (resolved_by_user_id = auth.uid())
);

-- 3. post_promotions SELECT ---------------------------------------------------------------------
DROP POLICY IF EXISTS post_promotions_select ON public.post_promotions;
CREATE POLICY post_promotions_select ON public.post_promotions FOR SELECT
USING (
  (promoted_by = auth.uid())
  OR (EXISTS (
        SELECT 1 FROM community_posts p
          JOIN community_group_members m ON m.group_id = p.group_id
        WHERE p.id = post_promotions.post_id
          AND m.user_id = auth.uid()
          AND m.role = ANY (ARRAY['admin','moderator'])))
  OR (EXISTS (
        SELECT 1 FROM profiles up
        WHERE up.id = auth.uid() AND up.is_platform_admin = true))
);

COMMIT;
