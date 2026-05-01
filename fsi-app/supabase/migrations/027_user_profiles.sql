-- Migration 027 — User profiles
--
-- Date: 2026-05-01
-- Phase: C (community functional scope)
--
-- Per-user profile metadata. Splits "human identity" data out of org-level
-- workspace_settings and away from the legacy `profiles` table (which mixes
-- auth, role, and community fields).
--
-- This table answers: "who is this human, what do they cover, what are
-- they certified to do?" Mirrors the UserProfile type defined in
-- design_handoff_2026-04/README.md ("Data-model additions for this batch").
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.
--
-- RLS policy summary:
--   * Self-read by authenticated users on any profile (community surfaces
--     render author headshots/names/verifier badges).
--   * Self-write on every column EXCEPT is_platform_admin.
--   * is_platform_admin is service-role-only on write. The user-update
--     policy WITH CHECK clause re-asserts the new value equals the stored
--     value, blocking privilege escalation.

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  headshot_url text,
  bio text,
  timezone text not null default 'UTC',
  sectors text[] not null default '{}',
  jurisdictions text[] not null default '{}',
  transport_modes text[] not null default '{}',
  verifier_status text not null default 'none'
    check (verifier_status in ('none', 'pending', 'active', 'revoked')),
  verifier_since timestamptz,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table user_profiles is
  'Per-user profile (Phase C). Human identity, coverage areas, verifier '
  'status, and platform-admin flag. Distinct from the legacy `profiles` '
  'table which mixes auth/role/community fields.';

comment on column user_profiles.is_platform_admin is
  'Caro''s Ledge internal staff flag. Service-role-only writeable. Read by '
  '`requirePlatformAdmin` in src/lib/api/auth.ts to gate /admin routes.';

comment on column user_profiles.verifier_status is
  'Editorial-board verifier credential lifecycle: none -> pending -> active '
  '(with verifier_since set) -> revoked. Drives the verified badge surfaced '
  'next to the user''s name in community threads, briefs, and disputes.';

-- Indexes
create index if not exists idx_user_profiles_platform_admin
  on user_profiles (is_platform_admin)
  where is_platform_admin = true;

create index if not exists idx_user_profiles_verifier_status
  on user_profiles (verifier_status)
  where verifier_status = 'active';

-- Auto-update timestamps. Reuses update_updated_at() from 001_schema.sql.
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at();

-- ──────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────

alter table user_profiles enable row level security;

-- Authenticated users can read any user's profile. Community surfaces
-- render the post author's name, headshot, bio, and verifier badge across
-- groups; restricting reads to self would break every author label.
create policy "user_profiles_read_authenticated"
  on user_profiles
  for select
  using (auth.role() = 'authenticated');

-- Self-insert. A user may create their own row exactly once.
-- is_platform_admin must be false at insert time (service role bypasses RLS).
create policy "user_profiles_insert_self"
  on user_profiles
  for insert
  with check (
    user_id = auth.uid()
    and is_platform_admin = false
  );

-- Self-update. The WITH CHECK clause re-asserts the new value of
-- is_platform_admin equals the row's stored value, preventing self-promotion.
-- Service role bypasses RLS and is the only path that can flip the flag.
create policy "user_profiles_update_self"
  on user_profiles
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and is_platform_admin = (
      select up.is_platform_admin
      from user_profiles up
      where up.user_id = auth.uid()
    )
  );

-- No DELETE policy: cascades from auth.users(id) on user deletion.

-- Service role full access for admin RPCs that need to flip is_platform_admin
-- or correct profile data.
create policy "user_profiles_service_role"
  on user_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ──────────────────────────────────────────────────────────────
-- Backfill
-- ──────────────────────────────────────────────────────────────
--
-- workspace_settings is org-scoped (org_id FK), not user-scoped. To seed
-- per-user sectors/jurisdictions we join through org_memberships. For users
-- in multiple orgs we take the earliest membership (DISTINCT ON ... ORDER BY
-- m.created_at). jurisdiction_weights is JSONB keyed by jurisdiction id, so
-- we extract the keys as a text[] to match the user_profiles.jurisdictions
-- column shape.
--
-- This is best-effort seeding; users will reconfirm sectors/jurisdictions
-- on first /profile visit.

insert into user_profiles (user_id, sectors, jurisdictions)
select distinct on (m.user_id)
  m.user_id,
  coalesce(ws.sector_profile, '{}'::text[]) as sectors,
  coalesce(
    array(select jsonb_object_keys(ws.jurisdiction_weights)),
    '{}'::text[]
  ) as jurisdictions
from org_memberships m
left join workspace_settings ws on ws.org_id = m.org_id
where not exists (
  select 1 from user_profiles up where up.user_id = m.user_id
)
order by m.user_id, m.created_at asc nulls last
on conflict (user_id) do nothing;

-- Also seed auth.users rows that have no org_membership at all (invited
-- users who haven't joined an org yet) so their profile exists on first
-- /profile visit.
insert into user_profiles (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from user_profiles up where up.user_id = u.id
)
on conflict (user_id) do nothing;
