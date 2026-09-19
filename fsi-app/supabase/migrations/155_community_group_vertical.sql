-- subject: Migration 155 (Template 11 Community — vertical groups, §7 KNOWN NEW BACKEND, 2026-07-07). Adds ONE nullable column `community_groups.vertical TEXT` + partial index `idx_community_groups_vertical (vertical, last_active_at DESC) WHERE vertical IS NOT NULL`. WHY: the surface shows regional ROOMS (region-keyed, vertical NULL) AND member-created VERTICAL groups that cut across regions by cargo vertical (fine art, live events, automotive…) — the mock's "they form when members create them" pending frame had no dimension to group on. A room has `vertical IS NULL`; a vertical group has `vertical` = a canonical sector id (validated at the app layer against ALL_SECTORS — NO CHECK, matching the free-text posture of `vertical_tags` from mig 007 so the taxonomy grows without a migration). Vertical groups are created cross-regional (region='GLOBAL') + public by `POST /api/community/groups`; the group INSERT goes through the caller's RLS client (mig-028 owner policy), the owner's bootstrap admin member row via service-role (members INSERT is admin-only, mig-029). Additive — does not touch the region column, the 7 seeded rooms (vertical stays NULL), or any RLS policy. Reversible (DROP COLUMN + DROP INDEX). APPLIED + verified 2026-07-07 (column text nullable + index present; 0 vertical groups; rooms keep vertical NULL). [glyph:verbatim]
-- 155_community_group_vertical.sql
--
-- Template 11 (Community) — the VERTICAL dimension on community_groups.
--
-- The Community surface (CommunityRooms.tsx) shows two kinds of space:
--   1. Regional ROOMS — the 7 canonical, seeded, region-keyed public rooms
--      (community-schema-mapping §1; region NOT NULL, vertical NULL).
--   2. Vertical GROUPS — member-created spaces that CUT ACROSS regions by
--      cargo vertical (fine art, live events, automotive…). The mock's
--      pending frame: "Rooms are regional; groups will cut across them by
--      vertical … They form when members create them." (HANDOFF §7 KNOWN NEW
--      BACKEND). Until this column + the create route land, that frame renders
--      honest-empty because there is no vertical dimension to group on.
--
-- This migration adds ONE nullable column so a group can carry a cargo
-- vertical. A regional room has `vertical IS NULL`; a vertical group has
-- `vertical` set to a canonical sector id (validated at the application layer
-- against ALL_SECTORS in src/lib/constants.ts — NO CHECK constraint here, so
-- the sector taxonomy can grow without a migration, matching the existing
-- free-text posture of intelligence_items.vertical_tags / sources.vertical_tags
-- from migration 007). Vertical groups are created cross-regional and keyed
-- region='GLOBAL' by the create route; the vertical column is what the surface
-- groups and renders them on.
--
-- Reversible: DROP COLUMN. Additive — does not touch the region column, the
-- 7 seeded rooms (their vertical stays NULL), or any existing RLS policy. The
-- existing community_groups_insert_authenticated policy (migration 028) already
-- lets an authenticated user create a group they own; the create route uses the
-- service role only to bootstrap the owner's first admin member row (the
-- members INSERT policy is admin-only by design, migration 029).

ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS vertical TEXT NULL;

COMMENT ON COLUMN public.community_groups.vertical IS
  'Cargo vertical (canonical sector id from ALL_SECTORS, e.g. fine-art, live-events, automotive) for a member-created cross-regional vertical GROUP. NULL for the 7 canonical regional ROOMS. No CHECK — validated at the application layer so the sector taxonomy can grow without a migration (matches vertical_tags posture, migration 007).';

-- Partial index: the surface lists vertical groups (vertical IS NOT NULL)
-- ordered by activity; a partial index keeps that read off the rooms.
CREATE INDEX IF NOT EXISTS idx_community_groups_vertical
  ON public.community_groups (vertical, last_active_at DESC)
  WHERE vertical IS NOT NULL;
