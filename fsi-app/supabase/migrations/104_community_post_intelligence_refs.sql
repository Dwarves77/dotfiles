-- Migration 104: community_posts.referenced_intelligence_item_ids
-- array column per operator Q5 decision (2026-05-24).
--
-- Q5: array column on community_posts, NOT a junction table. Junction
--     is premature scope until rich per-ref metadata emerges. Array
--     is sufficient for the cross-surface reference shape the
--     dispatch needs (post mentions intelligence_items by id).
--
-- Powers two cross-surface flows:
--   1. Post composition can mention intelligence items (e.g.
--      @reg:CBAM-2026-DA-14, or paste an intel URL). The parser
--      extracts the referenced UUIDs into this array.
--   2. Intelligence detail pages render a "Peer discussion, N
--      threads" panel listing community_posts that reference this
--      item, queryable via the GIN index below.

BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS referenced_intelligence_item_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_community_posts_ref_intel_ids
  ON community_posts USING GIN (referenced_intelligence_item_ids);

COMMENT ON COLUMN community_posts.referenced_intelligence_item_ids IS
  'UUIDs of intelligence_items this post references (Q5, 2026-05-24). Populated by post-compose parser when user mentions @reg:X or pastes an intel URL. Reverse lookup via GIN index powers the Peer Discussion panel on intelligence detail pages.';

COMMIT;
