-- subject: Migration 331 (lane HARNESS-LANDING, 2026-09-27). DRAFT / NOT APPLIED -- sketch approved by
-- coordinator review with one required amendment: per SEC-1 (migration 330, derivation_edges), every new
-- table ships locked down at creation (RLS enabled, anon/authenticated grants revoked, no policies,
-- service-role only) rather than closing the gap in a later fix lane.
--
-- WHY THIS TABLE. Harness-run artifacts (fsi-app/scripts/harness-runs/CONVENTION.md, one
-- <family>-run-NNN.json per run) currently land on master only via a branch pushed by
-- deliver-artifact-branch.sh, a PR that GitHub Actions cannot open (repo Actions permissions:
-- can_approve_pull_request_reviews=false), and a hand-merge off a tracking issue (#520) -- see
-- docs/ops/session-log.d/2026-09-26-harness-landing.md and .../2026-09-27-harness-runs-db-design.md.
-- Per operator ruling 2026-09-27 ("yes supabase but do not reinvent processes, look at what has already
-- been built"), this table generalizes the ALREADY-WORKING brief_apply_runs pattern (migration 322,
-- scripts/turns/io-preflight.mjs's recordApplyRunStart/recordApplyRunFinish via scripts/lib/db.mjs's
-- guardedInsert/guardedUpdate, rule 015) to every harness family instead of inventing a new mechanism.
--
-- Field mapping to CONVENTION.md's run-artifact JSON schema: harness_family, harness_version, run_id,
-- started_at, config, inputs_ref, per_item, metrics, defects_found, full_trace_refs, trigger,
-- upstream_run_id map straight across (jsonb for the object/array fields); config.github_run_id is
-- ALSO promoted to its own column so F50/loop-run-id.mjs's match-by-github_run_id stays a plain indexed
-- equality lookup instead of a jsonb reach-in on every hop. finished_at and source_branch/
-- source_artifact_path are new (the JSON schema has no finished_at today; the latter two are populated
-- only by the one-time stranded-branch import, scripts/turns/import-stranded-harness-branches.mjs, null
-- for every row a family's own writer inserts going forward).

-- ── Preconditions ────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.harness_runs') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: public.harness_runs already exists , this migration only ever CREATEs it';
  END IF;
END $$;

-- ── Table ────────────────────────────────────────────────────────────────────────────────────────────
create table public.harness_runs (
  run_id                text primary key,            -- "<family>-run-NNN", matches CONVENTION.md filename
  harness_family        text not null,
  harness_version       text,
  started_at            timestamptz not null,
  finished_at           timestamptz,
  trigger               text,                         -- workflow_run | workflow_dispatch | push | manual
  github_run_id         text,                         -- from config.github_run_id (F50/loop-run-id match key)
  upstream_run_id       text,
  config                jsonb not null default '{}'::jsonb,
  inputs_ref            jsonb not null default '[]'::jsonb,
  per_item              jsonb not null default '[]'::jsonb,
  metrics               jsonb not null default '{}'::jsonb,
  defects_found         jsonb not null default '[]'::jsonb,
  full_trace_refs       jsonb not null default '[]'::jsonb,
  source_branch         text,                         -- set only on rows landed via the one-time import
  source_artifact_path  text,                         -- set only on rows landed via the one-time import
  created_at            timestamptz not null default now()
);

create index harness_runs_family_started_idx on public.harness_runs (harness_family, started_at desc);
create index harness_runs_github_run_id_idx on public.harness_runs (github_run_id);

comment on table public.harness_runs is
  'One row per harness-run artifact (fsi-app/scripts/harness-runs/CONVENTION.md), landed by the '
  'service-role writer scripts/lib/record-harness-run.mjs (SHARED-WRITER: harness_runs) in place of the '
  'old branch-push + gh-pr-create + tracking-issue-520 path (migration 331, lane HARNESS-LANDING, '
  '2026-09-27; operator ruling: reuse the brief_apply_runs guarded-writer pattern, do not invent a new '
  'mechanism). Read by the harness-family schedule walker (fsi-app/scripts/verify/lib/'
  'harness-family-walk-scan.mjs, PR #810) and F50 (.discipline/governance/loop-manifest.mjs), both '
  'adapting rows into the same {name, parsed} shape their pure summarizers already consume. RLS ENABLED, '
  'no anon/authenticated policy (deny-all): every reader/writer is the service-role client, which '
  'bypasses RLS by role membership; there is no customer- or admin-surface reader of this table.';

-- ── Lock down at creation (SEC-1 posture, migration 330's template , coordinator-required amendment) ─────
-- service_role is untouched (not named below) , it needs its own grants (implicit table-owner grant plus
-- BYPASSRLS), and bypasses RLS entirely regardless of anything below.
revoke all on table public.harness_runs from anon, authenticated;

alter table public.harness_runs enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policy for anon/authenticated: deliberate, matching derivation_edges
-- (migration 330). This table has no user-facing or admin-facing reader; every consumer is the
-- service-role client (record-harness-run.mjs, the walker, F50).

-- ── Post-checks ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_grants int;
  rls_on boolean;
BEGIN
  SELECT count(*) INTO n_grants
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'harness_runs'
     AND grantee IN ('anon', 'authenticated');
  IF n_grants <> 0 THEN
    RAISE EXCEPTION 'ABORT: anon/authenticated hold % grant(s) on harness_runs after REVOKE', n_grants;
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relname = 'harness_runs';
  IF NOT rls_on THEN
    RAISE EXCEPTION 'ABORT: harness_runs.relrowsecurity is false after ENABLE ROW LEVEL SECURITY';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'harness_runs') THEN
    RAISE EXCEPTION 'ABORT: harness_runs unexpectedly carries a policy , this migration ships deny-all, no policy';
  END IF;
END $$;
