-- 151_community_post_signoff_requests.sql
--
-- Template 11 (Community) — the ONE genuinely-new table the redesign needs
-- (community-schema-mapping.md §3.1 / HANDOFF §7). Backs the mock's
-- "Request verifier sign-off" action (element #19) and the epistemic
-- conversion moment (HANDOFF §3): a peer signal becomes citable once a
-- verifier signs it off against a primary document.
--
-- STATUS: COMMITTED, NOT APPLIED. This file is the future-DDL-window shape.
-- Until it is applied by the main session, the T11 UI renders the sign-off
-- action in an honest-pending state (no request is written). Applying this
-- migration is a data/DDL change that lands via the migration track, not via
-- the redesign PR merge (code-vs-data state separation, CLAUDE.md).
--
-- Builds ONLY on the newer conversation layer (community_posts, migrations
-- 027–032/041/104). It does NOT touch the mig-007 forum layer.

create table if not exists public.community_post_signoff_requests (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.community_posts(id) on delete cascade,
  requested_by    uuid not null references auth.users(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'signed_off', 'declined', 'withdrawn')),
  -- who acted; must have profiles.verifier_status = 'active' (enforced by RLS below)
  verifier_id     uuid references auth.users(id) on delete set null,
  -- the primary document the verifier checked the claim against
  primary_doc_url text,
  decision_note   text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

-- At most one OPEN request per post (defence-in-depth against double-submit).
create unique index if not exists uniq_signoff_open_per_post
  on public.community_post_signoff_requests (post_id)
  where status = 'pending';

-- Fast lookup of a post's current sign-off state for the epistemic-chip read path.
create index if not exists idx_signoff_post
  on public.community_post_signoff_requests (post_id);

-- Companion: on a 'signed_off' decision a post becomes citable (earns the
-- platform's verified treatment). Adding the column keeps the epistemic-chip
-- read path a single-row lookup instead of a join.
alter table public.community_posts
  add column if not exists signed_off_at timestamptz,
  add column if not exists signed_off_by uuid references auth.users(id) on delete set null;

-- ── RLS ──
alter table public.community_post_signoff_requests enable row level security;

-- Requester reads their own requests; active verifiers + platform admins read all.
create policy signoff_select on public.community_post_signoff_requests
  for select using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.verifier_status = 'active' or p.is_platform_admin = true)
    )
  );

-- Any member of the post's group may open a request (self as requested_by).
create policy signoff_insert on public.community_post_signoff_requests
  for insert with check (
    requested_by = auth.uid()
    and exists (
      select 1
      from public.community_posts cp
      join public.community_group_members m
        on m.group_id = cp.group_id
      where cp.id = post_id
        and m.user_id = auth.uid()
    )
  );

-- Only active verifiers (or platform admins) may record a decision.
create policy signoff_decide on public.community_post_signoff_requests
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.verifier_status = 'active' or p.is_platform_admin = true)
    )
  );
