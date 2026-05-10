-- Migration 060: user_watchlist
-- Surfaces a per-user list of pinned items (sources, regulations, market signals)
-- consumed by the Dashboard Watchlist widget. item_id is text (not uuid) because
-- resource ids in this codebase are slug-like strings (legacy_id || uuid).

create table public.user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  item_type text not null check (item_type in ('source','reg','signal')),
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index user_watchlist_user_idx on public.user_watchlist (user_id);
create index user_watchlist_org_idx on public.user_watchlist (org_id);

alter table public.user_watchlist enable row level security;

create policy user_watchlist_select on public.user_watchlist
  for select using (auth.uid() = user_id);
create policy user_watchlist_insert on public.user_watchlist
  for insert with check (auth.uid() = user_id);
create policy user_watchlist_delete on public.user_watchlist
  for delete using (auth.uid() = user_id);
