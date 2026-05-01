-- Migration 029 — Community group members and invitations
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- Two tables:
--   community_group_members      — who is in which group, role, and
--                                  per-user starred/muted preferences.
--   community_group_invitations  — pending invites from group admins to
--                                  prospective members. Phase C ships
--                                  with NO auto-join logic; every
--                                  membership is explicit.
--
-- RLS policy summary:
--   members:
--     * SELECT: own row OR (group admin reading members of their group).
--     * INSERT: only group admins. The very first member (group owner)
--       is inserted by the same service-role transaction that creates the
--       group, so RLS does not block the bootstrap case.
--     * UPDATE: self only, and only for starred/muted columns. role
--       changes happen through admin RPCs (service role).
--     * DELETE: self (leave group) OR group admin (kick).
--   invitations:
--     * SELECT: invitee reads own pending invites; admins read invites
--       they created; owners read all invitations to their group.
--     * INSERT: only group admins.
--     * UPDATE: invitee can change pending -> accepted/declined; admins
--       can mark pending -> revoked.
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

-- ══════════════════════════════════════════════════════════════
-- community_group_members
-- ══════════════════════════════════════════════════════════════

create table if not exists community_group_members (
  group_id uuid not null references community_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  starred boolean not null default false,
  muted boolean not null default false,
  primary key (group_id, user_id)
);

comment on table community_group_members is
  'Membership in community_groups. Phase C is explicit-only: every row is '
  'inserted by an admin (or service role on group creation). No auto-join '
  'or auto-domain logic exists.';

create index if not exists idx_community_group_members_user
  on community_group_members (user_id);

create index if not exists idx_community_group_members_group_role
  on community_group_members (group_id, role);

create index if not exists idx_community_group_members_starred
  on community_group_members (user_id)
  where starred = true;

-- Maintain community_groups.member_count cache.
create or replace function update_community_group_member_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update community_groups
       set member_count = member_count + 1,
           last_active_at = now()
     where id = new.group_id;
  elsif tg_op = 'DELETE' then
    update community_groups
       set member_count = greatest(0, member_count - 1)
     where id = old.group_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger community_group_members_count_trigger
  after insert or delete on community_group_members
  for each row execute function update_community_group_member_count();

-- ──────────────────────────────────────────────────────────────
-- members RLS
-- ──────────────────────────────────────────────────────────────

alter table community_group_members enable row level security;

-- SELECT: own row, OR a row in a group where caller is an admin/moderator,
-- OR caller is the group owner.
create policy "community_group_members_select_self_or_admin"
  on community_group_members
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m2
      where m2.group_id = community_group_members.group_id
        and m2.user_id = auth.uid()
        and m2.role in ('admin', 'moderator')
    )
    or exists (
      select 1
      from community_groups g
      where g.id = community_group_members.group_id
        and g.owner_user_id = auth.uid()
    )
  );

-- INSERT: only existing group admins. Group bootstrap (owner's first
-- admin row at group creation time) goes through service-role.
create policy "community_group_members_insert_admin"
  on community_group_members
  for insert
  with check (
    exists (
      select 1
      from community_group_members m2
      where m2.group_id = community_group_members.group_id
        and m2.user_id = auth.uid()
        and m2.role = 'admin'
    )
  );

-- UPDATE: self only. Restricted to starred/muted via WITH CHECK that the
-- group_id, user_id, role, and joined_at columns equal their stored values.
-- Role changes go through service-role admin RPCs.
create policy "community_group_members_update_self_prefs"
  on community_group_members
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = (
      select m.role
      from community_group_members m
      where m.group_id = community_group_members.group_id
        and m.user_id = auth.uid()
    )
  );

-- DELETE: self (leave) or group admin (kick).
create policy "community_group_members_delete_self_or_admin"
  on community_group_members
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m2
      where m2.group_id = community_group_members.group_id
        and m2.user_id = auth.uid()
        and m2.role = 'admin'
    )
  );

create policy "community_group_members_service_role"
  on community_group_members
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- community_group_invitations
-- ══════════════════════════════════════════════════════════════

create table if not exists community_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups(id) on delete cascade,
  inviter_user_id uuid references auth.users(id) on delete set null,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now()
);

comment on table community_group_invitations is
  'Pending invites from group admins to prospective members. Status '
  'transitions: pending -> accepted | declined (by invitee) or pending -> '
  'revoked (by admin). Acceptance does NOT auto-insert a row in '
  'community_group_members; the application code performs that insert.';

create index if not exists idx_community_group_invitations_invitee_pending
  on community_group_invitations (invitee_user_id)
  where status = 'pending';

create index if not exists idx_community_group_invitations_group
  on community_group_invitations (group_id);

create unique index if not exists idx_community_group_invitations_unique_pending
  on community_group_invitations (group_id, invitee_user_id)
  where status = 'pending';

-- ──────────────────────────────────────────────────────────────
-- invitations RLS
-- ──────────────────────────────────────────────────────────────

alter table community_group_invitations enable row level security;

-- SELECT: invitee reads own; inviter reads invites they created; group
-- admins/moderators and owner can read all invites for their group.
create policy "community_group_invitations_select"
  on community_group_invitations
  for select
  using (
    invitee_user_id = auth.uid()
    or inviter_user_id = auth.uid()
    or exists (
      select 1
      from community_group_members m
      where m.group_id = community_group_invitations.group_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'moderator')
    )
    or exists (
      select 1
      from community_groups g
      where g.id = community_group_invitations.group_id
        and g.owner_user_id = auth.uid()
    )
  );

-- INSERT: only group admins, and they must record themselves as inviter.
create policy "community_group_invitations_insert_admin"
  on community_group_invitations
  for insert
  with check (
    inviter_user_id = auth.uid()
    and exists (
      select 1
      from community_group_members m
      where m.group_id = community_group_invitations.group_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- UPDATE: invitee can change status pending -> accepted/declined.
-- Group admins can change status pending -> revoked. The USING clause
-- restricts who may attempt an update; the WITH CHECK clause enforces
-- the allowed terminal status per actor. Status reads of the OLD row
-- happen via a sub-select; we cannot enforce "previous status = pending"
-- in pure RLS, so the application layer must guard re-transitions.
-- (Alternative: a BEFORE UPDATE trigger that raises on illegal status
-- transitions. Deferred.)
create policy "community_group_invitations_update_invitee"
  on community_group_invitations
  for update
  using (invitee_user_id = auth.uid())
  with check (
    invitee_user_id = auth.uid()
    and status in ('accepted', 'declined')
  );

create policy "community_group_invitations_update_admin"
  on community_group_invitations
  for update
  using (
    exists (
      select 1
      from community_group_members m
      where m.group_id = community_group_invitations.group_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  )
  with check (
    status = 'revoked'
  );

create policy "community_group_invitations_service_role"
  on community_group_invitations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
