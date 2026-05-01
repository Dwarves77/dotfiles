-- Migration 031 — Community topics
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- Per-user sidebar groupings. A "topic" is a personal label a user
-- attaches to a set of community_groups so they can collapse the sidebar
-- by their own taxonomy (e.g. "Air ETS work", "EU CBAM", "Vendor leads").
--
-- Topics are private to the owning user. They do NOT change group
-- membership and do NOT alter group visibility — they are pure UI
-- bookmarks. Two users can have a "EU work" topic that points to
-- entirely different group sets.
--
-- Mirrors CommunityTopic in design_handoff_2026-04/README_PREVIOUS.md.
--
-- RLS policy summary:
--   topics: full self-CRUD; no other user can read or write.
--   community_topic_groups: full self-CRUD gated through ownership of
--     the parent topic.
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

-- ══════════════════════════════════════════════════════════════
-- community_topics
-- ══════════════════════════════════════════════════════════════

create table if not exists community_topics (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

comment on table community_topics is
  'Per-user sidebar groupings (personal labels for sets of groups). '
  'Private to the owner; do not affect group membership or visibility.';

create index if not exists idx_community_topics_owner
  on community_topics (owner_user_id);

alter table community_topics enable row level security;

create policy "community_topics_select_owner"
  on community_topics
  for select
  using (owner_user_id = auth.uid());

create policy "community_topics_insert_owner"
  on community_topics
  for insert
  with check (owner_user_id = auth.uid());

create policy "community_topics_update_owner"
  on community_topics
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "community_topics_delete_owner"
  on community_topics
  for delete
  using (owner_user_id = auth.uid());

create policy "community_topics_service_role"
  on community_topics
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- community_topic_groups (junction)
-- ══════════════════════════════════════════════════════════════

create table if not exists community_topic_groups (
  topic_id uuid not null references community_topics(id) on delete cascade,
  group_id uuid not null references community_groups(id) on delete cascade,
  primary key (topic_id, group_id)
);

comment on table community_topic_groups is
  'Junction: which groups belong to which user-defined topic. RLS is '
  'enforced via ownership of the parent community_topics row.';

create index if not exists idx_community_topic_groups_group
  on community_topic_groups (group_id);

alter table community_topic_groups enable row level security;

-- All operations gated through ownership of the parent topic.
create policy "community_topic_groups_select_owner"
  on community_topic_groups
  for select
  using (
    exists (
      select 1 from community_topics t
      where t.id = community_topic_groups.topic_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "community_topic_groups_insert_owner"
  on community_topic_groups
  for insert
  with check (
    exists (
      select 1 from community_topics t
      where t.id = community_topic_groups.topic_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "community_topic_groups_delete_owner"
  on community_topic_groups
  for delete
  using (
    exists (
      select 1 from community_topics t
      where t.id = community_topic_groups.topic_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "community_topic_groups_service_role"
  on community_topic_groups
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
