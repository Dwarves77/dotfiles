-- Migration 032 — Community notifications, preferences, and moderation reports
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- Three tables:
--   notifications              — individual in-app notifications.
--   notification_preferences   — per-user toggles for notification kinds
--                                and delivery channels.
--   moderation_reports         — reports filed by users against posts,
--                                groups, or other users.
--
-- The notifications table here is intentionally distinct from the
-- pre-existing notification_events / notification_deliveries tables in
-- migration 007. Those track event-bus dispatch state across all of the
-- community layer; this `notifications` table is the per-user inbox the
-- bell-icon UI reads from. The two are wired together by application code
-- (a notification_event with matching subscriptions inserts rows here).
--
-- RLS policy summary:
--   notifications:
--     * SELECT: self only.
--     * UPDATE: self only (only used to set read_at).
--     * INSERT: service role only.
--   notification_preferences:
--     * Self read/write. on_invite is soft-enforced at the application
--       layer — invite notifications must always reach the invitee. (See
--       column comment.)
--   moderation_reports:
--     * SELECT: reporter reads own; group admins/moderators read reports
--       on posts in their group; platform admins read all.
--     * INSERT: any authenticated user.
--     * UPDATE: platform admins or group admins/moderators (for posts in
--       their group).
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

-- ══════════════════════════════════════════════════════════════
-- notifications
-- ══════════════════════════════════════════════════════════════

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null
    check (kind in ('mention', 'reply', 'promote', 'invite', 'moderation')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table notifications is
  'Per-user in-app inbox (bell icon). Distinct from notification_events '
  '(migration 007) which tracks platform-wide event dispatch. Application '
  'code inserts rows here when a matching subscription fires.';

comment on column notifications.kind is
  'Notification category. Drives UI grouping and overrides on '
  'notification_preferences (e.g. on_invite cannot be disabled).';

comment on column notifications.payload is
  'Free-form jsonb for the source of truth: post_id, group_id, '
  'inviter_user_id, etc. UI links and copy are rendered from this.';

-- Indexes
-- Unread-bell query: list unread notifications newest-first.
create index if not exists idx_notifications_user_unread
  on notifications (user_id, created_at desc)
  where read_at is null;

-- Full inbox query: list all notifications newest-first.
create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy "notifications_select_self"
  on notifications
  for select
  using (user_id = auth.uid());

-- Only used to flip read_at. WITH CHECK locks user_id, kind, payload, and
-- created_at to their stored values so users cannot mutate notification
-- content.
create policy "notifications_update_self_read"
  on notifications
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and kind = (select n.kind from notifications n where n.id = notifications.id)
    and payload = (select n.payload from notifications n where n.id = notifications.id)
    and created_at = (select n.created_at from notifications n where n.id = notifications.id)
  );

-- Inserts always come from service role (worker / admin RPC). No user
-- INSERT policy.

create policy "notifications_service_role"
  on notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- notification_preferences
-- ══════════════════════════════════════════════════════════════

create table if not exists notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  on_mention boolean not null default true,
  on_reply_in_my_threads boolean not null default true,
  on_new_post_in_joined_groups boolean not null default false,
  on_invite boolean not null default true,
  on_promote boolean not null default true,
  channels text[] not null default array['in_app']::text[],
  updated_at timestamptz not null default now()
);

comment on table notification_preferences is
  'Per-user notification toggles. Soft-enforces that on_invite cannot '
  'truly be disabled — the application worker ignores this column for '
  'kind=''invite'' notifications, ensuring an invitee always learns of a '
  'pending invite. (Documenting here because the constraint is not in '
  'the schema; trigger-level enforcement was deemed too rigid.)';

comment on column notification_preferences.on_invite is
  'Soft-enforced at the worker layer: invite notifications are always '
  'delivered regardless of this flag. The toggle is preserved in the '
  'schema to keep the column shape consistent for future relaxation.';

comment on column notification_preferences.channels is
  'Delivery channels: in_app | email | slack. Phase C ships in_app only; '
  'email/slack pipelines are deferred. Application code falls back to '
  'in_app if a configured channel is not yet supported.';

create trigger notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function update_updated_at();

alter table notification_preferences enable row level security;

create policy "notification_preferences_select_self"
  on notification_preferences
  for select
  using (user_id = auth.uid());

create policy "notification_preferences_insert_self"
  on notification_preferences
  for insert
  with check (user_id = auth.uid());

create policy "notification_preferences_update_self"
  on notification_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notification_preferences_delete_self"
  on notification_preferences
  for delete
  using (user_id = auth.uid());

create policy "notification_preferences_service_role"
  on notification_preferences
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- moderation_reports
-- ══════════════════════════════════════════════════════════════

create table if not exists moderation_reports (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null
    check (target_kind in ('post', 'group', 'user')),
  target_id uuid not null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null
);

comment on table moderation_reports is
  'Reports filed against posts, groups, or users. target_id is a soft FK '
  'whose target table is determined by target_kind (post -> '
  'community_posts; group -> community_groups; user -> auth.users). Soft '
  'because reports outlive their targets — a deleted post still has a '
  'historical report row.';

create index if not exists idx_moderation_reports_status
  on moderation_reports (status, created_at desc)
  where status = 'open';

create index if not exists idx_moderation_reports_target
  on moderation_reports (target_kind, target_id);

create index if not exists idx_moderation_reports_reporter
  on moderation_reports (reporter_user_id);

alter table moderation_reports enable row level security;

-- SELECT logic:
--   * Reporter reads own report.
--   * Group admin/moderator reads reports of kind='post' whose post lives
--     in a group they administrate.
--   * Group admin/moderator reads reports of kind='group' on their own
--     group.
--   * Platform admin reads all.
create policy "moderation_reports_select"
  on moderation_reports
  for select
  using (
    reporter_user_id = auth.uid()
    or (
      target_kind = 'post'
      and exists (
        select 1
        from community_posts p
        join community_group_members m on m.group_id = p.group_id
        where p.id = moderation_reports.target_id
          and m.user_id = auth.uid()
          and m.role in ('admin', 'moderator')
      )
    )
    or (
      target_kind = 'group'
      and exists (
        select 1
        from community_group_members m
        where m.group_id = moderation_reports.target_id
          and m.user_id = auth.uid()
          and m.role in ('admin', 'moderator')
      )
    )
    or exists (
      select 1
      from user_profiles up
      where up.user_id = auth.uid()
        and up.is_platform_admin = true
    )
  );

-- INSERT: any authenticated user can file a report. They must record
-- themselves as reporter (or NULL — anonymous reports are allowed by
-- leaving reporter_user_id null on the client, but only if the row is
-- inserted via service role; user-initiated inserts must self-attribute).
create policy "moderation_reports_insert_authenticated"
  on moderation_reports
  for insert
  with check (
    auth.role() = 'authenticated'
    and reporter_user_id = auth.uid()
    and status = 'open'
  );

-- UPDATE: platform admin or relevant group admin/moderator can resolve.
create policy "moderation_reports_update_admin"
  on moderation_reports
  for update
  using (
    exists (
      select 1
      from user_profiles up
      where up.user_id = auth.uid()
        and up.is_platform_admin = true
    )
    or (
      target_kind = 'post'
      and exists (
        select 1
        from community_posts p
        join community_group_members m on m.group_id = p.group_id
        where p.id = moderation_reports.target_id
          and m.user_id = auth.uid()
          and m.role in ('admin', 'moderator')
      )
    )
    or (
      target_kind = 'group'
      and exists (
        select 1
        from community_group_members m
        where m.group_id = moderation_reports.target_id
          and m.user_id = auth.uid()
          and m.role in ('admin', 'moderator')
      )
    )
  )
  with check (
    -- The actor recording the resolution must be the caller.
    resolved_by_user_id is null
    or resolved_by_user_id = auth.uid()
  );

create policy "moderation_reports_service_role"
  on moderation_reports
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
