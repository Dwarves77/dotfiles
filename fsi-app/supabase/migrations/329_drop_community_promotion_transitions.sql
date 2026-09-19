-- Migration 329 (lane m9c, 2026-09-18): drop community_promotion_transitions, retiring promotion
-- mechanism A. Stage audit findings 8/9 (docs/audits/stage-audit-2026-09-18/s6-gates-harness.md) and
-- the build plan (docs/plans/complete-system-build-plan-2026-09-04.md section 6.1, lane M9) found two
-- community promotion mechanisms coexisting: community_promotion_transitions (migration 295, the
-- five-gate promotion_state machine's audit log, src/lib/community/promotion.mjs) and post_promotions
-- (migration 041, the editorial-pickup path, src/app/api/community/posts/[id]/promote/route.ts). Only
-- post_promotions is reached by a live route; promotion.mjs has zero production importers outside its
-- own test (grep, this lane and the 2026-09-18 audit, both confirm). Verified live before this drop,
-- this lane, read-only SQL: community_promotion_transitions 0 rows, post_promotions 0 rows, 0 foreign
-- keys reference community_promotion_transitions, its 2 RLS policies and 2 indexes (pkey +
-- idx_community_promotion_transitions_post) exist only on this table and drop with it, its 4 triggers
-- are internal FK referential-integrity triggers (RI_ConstraintTrigger_*, not custom logic) that drop
-- with it too. Nothing else in the migration tree adds a trigger, function or policy referencing this
-- table (grep, this lane).
--
-- Kept, unaffected by this migration: community_posts.promotion_state and community_posts.stance
-- (migration 295's other two changes); mechanism B does not use either column today, but they are not
-- part of the audit's dormant-mechanism finding and the brief that authored this migration scopes the
-- drop to the audit log table only.
--
-- Two-track policy (standing rule 3): schema DDL, committed here, applied by the coordinator via the
-- Supabase management API before this lane's code merges.

DO $$
BEGIN
  IF to_regclass('public.community_promotion_transitions') IS NULL THEN
    RAISE NOTICE 'community_promotion_transitions already absent, nothing to drop';
  END IF;
END $$;

DROP TABLE IF EXISTS public.community_promotion_transitions;

DO $$
BEGIN
  IF to_regclass('public.community_promotion_transitions') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: community_promotion_transitions still exists after DROP TABLE';
  END IF;
  RAISE NOTICE 'migration 329 OK: community_promotion_transitions dropped (promotion mechanism A retired, post_promotions is the one path)';
END $$;
