-- Migration 025 — Sector activation interest tracking
--
-- Future feature placeholder per docs/intelligence-summaries-proposal.md
-- (decision 2026-04-30 SHELVED). When per-sector reporting is activated,
-- the system needs a signal of which workspaces opted in for notification.
--
-- Two new columns on workspace_settings:
--   notify_on_sector_activation: workspace wants email when per-sector
--     reports become available for any of their selected sectors.
--   sectors_activation_signup_at: timestamp of first opt-in (immutable
--     once set; surfaces "you signed up N days ago" UX).
--
-- Schema migration. Apply BEFORE deploying the dependent code per the
-- two-track migration policy in STATUS.md rule 12.

alter table workspace_settings
  add column if not exists notify_on_sector_activation boolean not null default false,
  add column if not exists sectors_activation_signup_at timestamptz;

comment on column workspace_settings.notify_on_sector_activation is
  'True if the workspace opted in to receive notification when per-sector '
  'reporting activates. Read at activation-feature launch time to drive a '
  'one-time email/in-app announcement.';

comment on column workspace_settings.sectors_activation_signup_at is
  'When the workspace first opted in. Set on the first transition false→true; '
  'never overwritten on subsequent toggles. Null = never opted in.';
