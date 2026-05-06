-- Migration 041 — Community-post promotion audit
--
-- Date: 2026-05-04
-- Phase: C, Block C6 (promote-post-to-intelligence)
--
-- Purpose
-- -------
-- When a community_post represents a real regulatory finding worth
-- elevating onto the platform, an admin or designated promoter can
-- convert it into an intelligence_items row directly (kind='direct',
-- platform admin only) OR stage it for review via staged_updates
-- (kind='staged', any group member). This migration records every
-- promotion decision in an immutable audit table.
--
-- Tables / mutations
-- ------------------
--   * NEW table  post_promotions          — audit row per promotion
--   * ALTER      community_posts          — promoted_at / promoted_to_item_id
--
-- Idempotency model
-- -----------------
-- A post is promoted at most once. The /api/community/posts/[id]/promote
-- handler short-circuits with 409 Conflict when community_posts.promoted_at
-- IS NOT NULL. The audit table itself does not enforce this — it is a
-- log, not a state machine — but the partial unique index below adds a
-- defence-in-depth guarantee: at most one promotion row per post.
--
-- Apply order
-- -----------
-- This migration depends on 028 (community_groups), 030 (community_posts),
-- and 004 (intelligence_items + staged_updates). It does NOT depend on
-- 040 (PR #20) — apply after 040 lands on master, OR before, in either
-- order, since the schemas are independent. The "after 040" instruction
-- in C6-promote-spec.md is a sequence convention only.
--
-- Two-track migration policy: schema migration. Apply BEFORE deploying
-- the dependent code per STATUS.md rule 12. The orchestrator applies
-- this file via supabase CLI after the C6 PR is opened — do NOT execute
-- against the live DB from a development branch.

-- ══════════════════════════════════════════════════════════════
-- post_promotions — audit log for community → intelligence promotions
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS post_promotions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id               UUID NOT NULL
                          REFERENCES community_posts(id) ON DELETE CASCADE,
  promoted_by           UUID NOT NULL
                          REFERENCES auth.users(id) ON DELETE SET NULL,
  promotion_kind        TEXT NOT NULL
                          CHECK (promotion_kind IN ('staged', 'direct')),
  staged_update_id      UUID NULL
                          REFERENCES staged_updates(id) ON DELETE SET NULL,
  intelligence_item_id  UUID NULL
                          REFERENCES intelligence_items(id) ON DELETE SET NULL,
  notes                 TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE post_promotions IS
  'Audit log for community-post promotions. One row per promotion decision. '
  'kind=staged populates staged_update_id; kind=direct populates '
  'intelligence_item_id. Immutable from the application — written by the '
  '/api/community/posts/[id]/promote handler, never updated.';

COMMENT ON COLUMN post_promotions.promotion_kind IS
  'staged = post staged into staged_updates for admin review (any group '
  'member may stage). direct = post inserted directly into intelligence_items '
  '(platform admin only). Default flow is staged.';

COMMENT ON COLUMN post_promotions.notes IS
  'Free-form reviewer note captured at promotion time. Surfaces in admin '
  'review queue alongside staged_updates.reason for staged promotions.';

CREATE INDEX IF NOT EXISTS idx_post_promotions_post
  ON post_promotions (post_id);

CREATE INDEX IF NOT EXISTS idx_post_promotions_user
  ON post_promotions (promoted_by);

-- Defence-in-depth: at most one promotion row per post. The handler also
-- checks community_posts.promoted_at; this index prevents a race in which
-- two concurrent requests both pass the application check.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_promotions_one_per_post
  ON post_promotions (post_id);

-- ══════════════════════════════════════════════════════════════
-- community_posts — promotion-state columns
-- ══════════════════════════════════════════════════════════════

-- promoted_at is the canonical "this post has been promoted" flag. Set on
-- any successful promotion, regardless of kind. Drives the 409 idempotency
-- check in the handler and the "Promoted" badge in C5's Post.tsx.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ NULL;

-- promoted_to_item_id is populated only on kind='direct' (the post became
-- an intelligence_item immediately). For kind='staged' it remains NULL
-- until and unless the staged_update is approved — at which point a
-- separate path (Phase D follow-up) backfills this column.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS promoted_to_item_id UUID NULL
    REFERENCES intelligence_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_promoted_to_item
  ON community_posts (promoted_to_item_id)
  WHERE promoted_to_item_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════
-- RLS — post_promotions
-- ══════════════════════════════════════════════════════════════
--
-- Read model:
--   * Promoter reads their own promotion rows.
--   * Group admins/moderators read promotion rows for posts in their group.
--   * Platform admins read all.
-- Write model:
--   * INSERT goes through service-role only. The /api/community/posts/[id]/
--     promote handler validates membership/admin status, then writes the
--     audit row with the service-role client (matching the pattern used by
--     /api/community/groups/[id]/join for self-join).
--   * UPDATE / DELETE: nobody. Audit logs are immutable from the app.

ALTER TABLE post_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_promotions_select"
  ON post_promotions
  FOR SELECT
  USING (
    promoted_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM community_posts p
      JOIN community_group_members m ON m.group_id = p.group_id
      WHERE p.id = post_promotions.post_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'moderator')
    )
    OR EXISTS (
      SELECT 1
      FROM user_profiles up
      WHERE up.user_id = auth.uid()
        AND up.is_platform_admin = TRUE
    )
  );

CREATE POLICY "post_promotions_service_role"
  ON post_promotions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
