-- Migration 030 — Community posts
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- Posts and threaded replies in a single self-referential table.
--   parent_post_id IS NULL  -> top-level post (has a title)
--   parent_post_id IS NOT NULL -> reply (title is null, body required)
--
-- promoted_from_post_id supports the promote-to-public flow described in
-- design_handoff_2026-04/README_PREVIOUS.md (a post in a private group is
-- republished into a public group with attribution metadata logged).
--
-- RLS policy summary:
--   * SELECT inherits group visibility (public group OR caller is a
--     member of the post's group).
--   * INSERT only by group members.
--   * UPDATE / DELETE by author OR by group admin/moderator.
--
-- ON DELETE behaviour:
--   * group_id ON DELETE CASCADE: deleting a group deletes its posts.
--   * parent_post_id ON DELETE CASCADE: deleting a top-level post
--     removes its replies.
--   * author_user_id ON DELETE SET NULL: deleting a user does NOT delete
--     their posts; author becomes null (per spec — preserve content).
--   * promoted_from_post_id ON DELETE SET NULL: original post deletion
--     does not cascade-delete the promoted copy.
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  parent_post_id uuid references community_posts(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  last_reply_at timestamptz,
  reply_count int not null default 0,
  promoted_from_post_id uuid references community_posts(id) on delete set null,
  attribution text
    check (attribution is null or attribution in ('editorial', 'original-author', 'anonymous')),
  -- A reply has no title; a top-level post must have a title. Enforced
  -- structurally so the application layer cannot drift.
  constraint community_posts_title_shape
    check (
      (parent_post_id is null and title is not null)
      or (parent_post_id is not null and title is null)
    )
);

comment on table community_posts is
  'Posts and replies in community groups. Self-referential via '
  'parent_post_id. Top-level posts have a title; replies do not.';

comment on column community_posts.promoted_from_post_id is
  'Set when this post was created via the promote-to-public flow '
  '(a private-group post republished into a public group). The original '
  'post is preserved; this copy carries attribution metadata.';

comment on column community_posts.attribution is
  'Attribution mode for promoted posts. NULL on regular posts. One of '
  'editorial (Caro''s Ledge editorial team), original-author (preserve '
  'name), or anonymous (strip name).';

-- Indexes
create index if not exists idx_community_posts_group
  on community_posts (group_id);

create index if not exists idx_community_posts_parent
  on community_posts (parent_post_id);

create index if not exists idx_community_posts_author
  on community_posts (author_user_id);

-- Primary feed query: latest activity per group.
create index if not exists idx_community_posts_group_last_reply
  on community_posts (group_id, last_reply_at desc nulls last);

create index if not exists idx_community_posts_promoted_from
  on community_posts (promoted_from_post_id)
  where promoted_from_post_id is not null;

-- ──────────────────────────────────────────────────────────────
-- Reply counter trigger
-- ──────────────────────────────────────────────────────────────

create or replace function update_community_post_reply_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' and new.parent_post_id is not null then
    update community_posts
       set reply_count = reply_count + 1,
           last_reply_at = new.created_at
     where id = new.parent_post_id;
    -- bubble last_active_at up to the group
    update community_groups
       set last_active_at = new.created_at
     where id = new.group_id;
  elsif tg_op = 'DELETE' and old.parent_post_id is not null then
    update community_posts
       set reply_count = greatest(0, reply_count - 1)
     where id = old.parent_post_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger community_posts_reply_count_trigger
  after insert or delete on community_posts
  for each row execute function update_community_post_reply_count();

-- ──────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────

alter table community_posts enable row level security;

-- SELECT: post is visible iff its group is public OR caller is a member.
create policy "community_posts_select_inherits_group"
  on community_posts
  for select
  using (
    exists (
      select 1
      from community_groups g
      where g.id = community_posts.group_id
        and (
          g.privacy = 'public'
          or exists (
            select 1
            from community_group_members m
            where m.group_id = g.id
              and m.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT: only group members may post. author_user_id must be the caller.
create policy "community_posts_insert_member"
  on community_posts
  for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from community_group_members m
      where m.group_id = community_posts.group_id
        and m.user_id = auth.uid()
    )
  );

-- UPDATE: author OR group admin/moderator.
create policy "community_posts_update_author_or_admin"
  on community_posts
  for update
  using (
    author_user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m
      where m.group_id = community_posts.group_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'moderator')
    )
  )
  with check (
    author_user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m
      where m.group_id = community_posts.group_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'moderator')
    )
  );

-- DELETE: author OR group admin/moderator.
create policy "community_posts_delete_author_or_admin"
  on community_posts
  for delete
  using (
    author_user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m
      where m.group_id = community_posts.group_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'moderator')
    )
  );

create policy "community_posts_service_role"
  on community_posts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
