-- subject: Migration 348 (lane C-SOCIAL, 2026-10-03, ADR-041 "Community is social only"). Drops the Community-to-corpus promotion schema: post_promotions and the five promotion/provenance columns on community_posts. APPLIED 2026-10-03 (operator window, ADR-011; read-back: table and five columns absent).
-- Migration 348: Community is social only (ADR-041).
--
-- Operator ruling, 2026-10-03, verbatim: "Community is a resource for people to discuss what they're
-- doing in their own regions and how they're working through things if they wanna link a regulation or
-- something that they wanna talk about from the system that's OK, but we should not be using community
-- to feed data into the rest of the pages absolutely not." And: "It is a social place. It is not a
-- source of information."
--
-- ORDER OF APPLICATION: this migration is applied AFTER the C-SOCIAL PR merges. It drops columns the
-- OLD code read (community_posts.promotion_state, origin_class, promoted_at, promoted_to_item_id,
-- stance), so applying it before the merge would break the old code's selects. The PR removes every
-- reader and writer first (data migrations commit with consumer code and run after merge, standing rule 3).
--
-- Live state verified 2026-10-03 (read-only SELECT, by the coordinator): community_posts 0 rows,
-- post_promotions 0 rows, 0 promoted or linked staged_updates, 0 promoted or linked intelligence_items.
-- Nothing is lost by the drops.
--
-- WHAT GOES (real object names read from migrations 041, 293, 295):
--   * public.post_promotions (migration 041): its RLS policies post_promotions_select (re-pointed by 182)
--     and post_promotions_service_role, and indexes idx_post_promotions_post, idx_post_promotions_user and
--     uniq_post_promotions_one_per_post drop with the table.
--   * idx_community_posts_promoted_to_item (migration 041, partial index on promoted_to_item_id).
--   * idx_community_posts_promotion_state (migration 295, partial index on promotion_state).
--   * community_posts.promoted_at, promoted_to_item_id (041), promotion_state (295, plus its CHECK
--     community_posts_promotion_state_check), stance (295, plus its CHECK community_posts_stance_check),
--     origin_class (293, plus its CHECK community_posts_origin_class_check).
--
-- WHAT STAYS: community_posts.promoted_from_post_id (a repost link inside Community). origin_class on every
-- OTHER table (intelligence_items, sources, derived facts, and so on) and the shared ORIGIN_CLASS
-- vocabulary values, including 'community' and 'community-corroborated', are untouched: this migration
-- only removes Community's own column. community_promotion_transitions was already dropped by 329.

BEGIN;

DROP TABLE IF EXISTS public.post_promotions;

DROP INDEX IF EXISTS public.idx_community_posts_promoted_to_item;
DROP INDEX IF EXISTS public.idx_community_posts_promotion_state;

ALTER TABLE public.community_posts
  DROP COLUMN IF EXISTS promoted_at,
  DROP COLUMN IF EXISTS promoted_to_item_id,
  DROP COLUMN IF EXISTS promotion_state,
  DROP COLUMN IF EXISTS stance,
  DROP COLUMN IF EXISTS origin_class;

DO $$
DECLARE
  n_cols integer;
BEGIN
  IF to_regclass('public.post_promotions') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: post_promotions still exists after DROP TABLE';
  END IF;
  SELECT count(*) INTO n_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'community_posts'
     AND column_name IN ('promoted_at', 'promoted_to_item_id', 'promotion_state', 'stance', 'origin_class');
  IF n_cols <> 0 THEN
    RAISE EXCEPTION 'ABORT: % promotion column(s) still exist on community_posts after DROP COLUMN', n_cols;
  END IF;
  RAISE NOTICE 'migration 348 OK: post_promotions and community_posts.{promoted_at,promoted_to_item_id,promotion_state,stance,origin_class} dropped (ADR-041)';
END $$;

COMMIT;
