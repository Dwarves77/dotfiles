-- subject: Migration 028, Community groups
-- Migration 028 — Community groups
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- The top-level container for community discussion. A group has a name,
-- region, privacy mode, owner, and member-count cache. Posts live inside
-- groups (migration 030); membership is governed by community_group_members
-- (migration 029).
--
-- Mirrors the CommunityGroup type in design_handoff_2026-04/README_PREVIOUS.md
-- with two scope reductions for Phase C:
--   * No `joinPolicy` column. Joins are explicit (admin invite or admin
--     approval of a request); no auto-domain or auto-join logic exists in
--     the schema.
--   * No `workplace` privacy tier. Phase C ships with `public` and `private`
--     only.
--
-- RLS policy summary:
--   * SELECT: public groups readable by any authenticated user; private
--     groups readable only by members.
--   * INSERT: any authenticated user (becomes owner via owner_user_id).
--   * UPDATE / DELETE: only the owner OR a group admin (role='admin' in
--     community_group_members).
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.
--
-- 2026-10-08 (lane MIG-CI, ruling after chain-proof replay run 37763816032): three policies (select, update and
-- delete; four references to community_group_members) moved from 028 to 029 because they reference
-- community_group_members, created in 029; final schema identical; both rows were already class code-differs in
-- APPLIED-MAP.json; the migration-history audit's expected CODE_DIFFERS for 028 and 029 is unchanged in class.
-- [HYPOTHESIS] The ledger row for 028 is a migration repair row carrying this file's text, not a record that the
-- file ran at this position: 028 as written cannot execute before 029 in any order.

create table if not exists community_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  region text not null
    check (region in ('EU', 'UK', 'US', 'LATAM', 'APAC', 'HK', 'MEA', 'GLOBAL')),
  privacy text not null
    check (privacy in ('public', 'private')),
  owner_user_id uuid not null references auth.users(id) on delete set null,
  description text,
  member_count int not null default 0,
  weekly_post_count int not null default 0,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table community_groups is
  'Top-level community discussion container. Phase C ships with public and '
  'private groups only; workplace tier and join policies are deferred.';

comment on column community_groups.owner_user_id is
  'Original creator. ON DELETE SET NULL preserves the group when the owner '
  'is deleted; remaining admins continue to manage it.';

comment on column community_groups.member_count is
  'Cached member count. Maintained by trigger on community_group_members '
  '(see migration 029).';

comment on column community_groups.weekly_post_count is
  'Cached count of posts in this group in the trailing 7 days. Refreshed '
  'by a scheduled job (deferred).';

-- Indexes
create index if not exists idx_community_groups_region
  on community_groups (region);

create index if not exists idx_community_groups_privacy
  on community_groups (privacy);

create index if not exists idx_community_groups_owner
  on community_groups (owner_user_id);

create index if not exists idx_community_groups_last_active
  on community_groups (last_active_at desc);

-- ──────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────

alter table community_groups enable row level security;

-- The SELECT, UPDATE and DELETE policies below read community_group_members, which migration 029 creates, so they
-- live at the end of migration 029 (moved 2026-10-08, see the block in the header above).

-- INSERT: any authenticated user can create a group. They are recorded
-- as owner; the application code is responsible for inserting a
-- corresponding admin row in community_group_members.
create policy "community_groups_insert_authenticated"
  on community_groups
  for insert
  with check (
    auth.role() = 'authenticated'
    and owner_user_id = auth.uid()
  );

-- Service role full access for moderation and platform-admin tooling.
create policy "community_groups_service_role"
  on community_groups
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
