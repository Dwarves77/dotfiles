-- Migration 024 — Admin action cooldowns
--
-- Tracks the last time a cooldown-gated admin action was triggered.
-- Used by /api/admin/scan to enforce the 4h cooldown that was advertised
-- in CLAUDE.md but never implemented in code (drift 3 in admin-scan-audit.md).
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

create table if not exists admin_action_cooldowns (
  action_key text primary key,
  last_triggered_at timestamptz not null default now(),
  triggered_by uuid references auth.users(id) on delete set null,
  metadata jsonb default '{}'::jsonb
);

comment on table admin_action_cooldowns is
  'Singleton-per-action ledger. One row per cooldown-gated admin action. '
  'Updated on every successful trigger; read on every attempt to gate by elapsed time.';

create index if not exists admin_action_cooldowns_last_triggered_idx
  on admin_action_cooldowns (last_triggered_at desc);

-- RLS: service role writes only (admin actions go through API routes that use service-role client).
alter table admin_action_cooldowns enable row level security;

create policy "service role full access" on admin_action_cooldowns
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
