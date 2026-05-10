-- Migration 061: coverage_gaps
-- Hand-curated table that backs the Dashboard "Coverage gaps" widget.
-- v1 is curated by editors. v2 (out of scope here) will derive entries by
-- comparing the workspace's active sectors against an industry-standard
-- taxonomy of expected sources. Description is rendered with <i> callouts
-- per the spec.

create table public.coverage_gaps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  jurisdiction text,
  sector_affinity text[] not null default '{}',
  severity text not null check (severity in ('high','medium','low')),
  description text not null,
  suggested_action_label text not null,
  suggested_action_href text not null,
  created_at timestamptz not null default now()
);

create index coverage_gaps_severity_idx on public.coverage_gaps (severity);

alter table public.coverage_gaps enable row level security;

create policy coverage_gaps_select on public.coverage_gaps
  for select using (true);

insert into public.coverage_gaps
  (title, jurisdiction, sector_affinity, severity, description, suggested_action_label, suggested_action_href)
values
  (
    'Switzerland packaging waste regulation',
    'CH',
    array['packaging','waste'],
    'high',
    'Federal ordinance update suggests new alignment requirements; <i>no current source in registry.</i>',
    'Suggest a source',
    '/admin?tab=coverage&suggest=ch-packaging-waste'
  ),
  (
    'CA SB 261 climate-related financial risk',
    'US-CA',
    array['finance','climate-disclosure'],
    'medium',
    'Sister regulation to SB 253; <i>tracked partially.</i>',
    'Add to registry',
    '/admin?tab=coverage&add=ca-sb-261'
  );
