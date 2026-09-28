# Harness runs land in Supabase, on the existing writer pattern (2026-09-27)

OPERATOR RULING (2026-09-27, verbatim): "Yes supabase but do not reinvent processes, look at what has
already been built". Continuing PR #813's branch (`coord/harness-landing`) per this ruling: reuse the
existing guarded-writer mechanism rather than inventing a new one.

## Step 1: what already exists

[CONFIRMED, live SQL against project `kwrsbpiseruzbfwjpvsp`] Six tables match `run|dispatch|harness|
ledger|loop|artifact`: `agent_run_searches`, `agent_runs`, `brief_apply_runs`, `connection_theme_runs`,
`disposition_ledger`, `funded_pass_runlock`. None is a generic multi-family harness-run table. The
closest analog, and the one that should be the TEMPLATE, is **`brief_apply_runs`**
(`run_id text`, `mode text`, `started_at`, `finished_at`, `bytes_read`, `items_applied`, `stop_reason`) -
migration 322, one row per brief-apply run, written by a real, already-working guarded pattern:

- `fsi-app/scripts/turns/io-preflight.mjs` exports `recordApplyRunStart` (plain `sb.from("brief_apply_runs")
  .insert(...)`, exempt from rule 015 because an INSERT is additive, not a mutation) and
  `recordApplyRunFinish` (routes through `scripts/lib/db.mjs`'s `guardedUpdate`, rule 015: reversible,
  skill-cited). Both are marked `// SHARED-WRITER: brief_apply_runs` at the file header, tracked by
  `fsi-app/.discipline/shared-writer-registry.test.mjs`.
- `db.mjs` already has a general-purpose `guardedInsert`/`guardedInsertMany` (not just the plain-insert
  exemption `recordApplyRunStart` uses), so a new writer has a ready-made guarded path to call.
- The "dispatch ledger" (`docs/ops/dispatch-ledger.jsonl`, `fsi-app/scripts/harness-runs/
  append-dispatch-ledger.mjs`) is a git-tracked JSONL file, not a DB table - a different, older mechanism,
  not what this ruling is pointing at.
- `loop-run-id.mjs` / F50 resolve a run's identity from the FILESYSTEM artifact's `config.github_run_id`
  and `config.loop_run_id` fields (`scripts/lib/run-artifact.mjs`'s `writeRunArtifact`, explicitly
  filesystem-only, "No I/O side effects on import. No network, no DB" by design). This is the reader side
  that needs to gain a DB source once artifacts land there instead of (or in addition to) the git tree.

**Field mapping, `<family>-run-NNN.json` artifact to table row** (CONVENTION.md's schema to the new
table below): `harness_family`, `harness_version`, `run_id`, `started_at`, `config`, `inputs_ref`,
`per_item`, `metrics`, `defects_found`, `full_trace_refs`, `trigger`, `upstream_run_id`, and
`config.github_run_id` all map straight across, one column each (JSON fields stay `jsonb`). No
`finished_at` exists in the artifact schema today; the table below carries one anyway (nullable),
matching `brief_apply_runs`'s own two-phase start/finish shape, and a family's writer can leave it null
if a family never needs a finish-time update.

## Step 2 (UPDATE, later same day): coordinator-approved amendment, applied, live RLS attack green

Coordinator review approved the sketch below on reuse grounds, WITH one required amendment: per SEC-1
(migration 330, `derivation_edges`), every new table ships locked down AT CREATION (RLS enabled,
anon/authenticated revoked, no policies, service-role only) rather than closing the gap in a later fix
lane. `fsi-app/supabase/migrations/331_harness_runs.sql` was amended accordingly (revoke + enable RLS +
post-check DO block, migration 330's own template). Operator then lifted the push/merge hold (worktree
node_modules fix landed, PR #815) and authorized: apply the migration, run the live adversarial attack,
build the writer, wire the walker, push, and test for real. All of that is now DONE, in order:

- **[CONFIRMED, `apply_migration` via MCP]** Migration `331_harness_runs` applied to project
  `kwrsbpiseruzbfwjpvsp`, confirmed in `supabase_migrations.schema_migrations`
  (`version=20260928014509`, `name=331_harness_runs`).
- **[CONFIRMED, live `execute_sql` attack, one transaction, always rolled back]** Six probes, all PASS:
  anon INSERT denied, anon UPDATE denied, anon DELETE denied, authenticated INSERT denied, authenticated
  SELECT sees 0 rows, service_role (BYPASSRLS) sees its own fixture row (the both-directions proof: the
  guard denies unauthorized roles without bricking the legitimate path). Fixture and results scratch
  table both cleaned up; `select count(*) from harness_runs where run_id like 'rls-attack%'` returned 0
  afterward.
- **[CONFIRMED]** `fsi-app/scripts/verify/harness-runs-rls-adversarial-audit.mjs` written, modeled on
  `derivation-edges-rls-adversarial-audit.mjs`, auto-discovered by the data-audit lane's marker scan
  (`// data-audit: label=harness-runs-rls-adversarial hard=true`), execution-wired per rule 15.

## Step 2 (original sketch, DDL only, at the time NOT applied)

```sql
-- DRAFT, NOT APPLIED. Sketch only per operator instruction: "if the existing table lacks a column you
-- need, stop and give me the migration sketch, don't apply."
create table if not exists harness_runs (
  run_id                text primary key,           -- "<family>-run-NNN", matches CONVENTION.md
  harness_family        text not null,
  harness_version       text,
  started_at            timestamptz not null,
  finished_at            timestamptz,
  trigger               text,                        -- workflow_run | workflow_dispatch | push | manual
  github_run_id         text,                        -- from config.github_run_id (F50/loop-run-id match key)
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
create index if not exists harness_runs_family_started_idx on harness_runs (harness_family, started_at desc);
create index if not exists harness_runs_github_run_id_idx on harness_runs (github_run_id);
```

Not applied. Once it is, the writer side is: a new module `fsi-app/scripts/lib/record-harness-run.mjs`
(`// SHARED-WRITER: harness_runs` header, registered per `shared-writer-registry.test.mjs`) exporting
`recordHarnessRun(sb, artifact)`, best-effort `guardedInsert("harness_runs", row, { cite, select: "run_id" })`
from `db.mjs`, called from `deliver-artifact-branch.sh`'s replacement step right after
`writeRunArtifact` produces the JSON (same two-step shape `brief_apply_runs` already uses: the artifact
stays the filesystem source of truth for the SAME run's own local checkout; the table is the durable,
cross-run, cross-branch record other consumers read). `deliver-artifact-branch.sh`'s push-branch +
`gh pr create` + issue-#520-fallback body is removed entirely and replaced by a call to that script; no
`.github/workflows/*.yml` file needs editing (the emit step already calls a script, this only changes
target). The walker (`fsi-app/scripts/verify/lib/harness-family-walk-scan.mjs`, PR #810) and F50
(`.discipline/governance/loop-manifest.mjs`) both already consume artifacts as plain `{name, parsed}`
pairs (`summarizeFamilyDispatchHistory`, pure) - each needs one new call site that queries `harness_runs`
and adapts rows to that same shape (`name: run_id + ".json"`, `parsed: <the row's own jsonb columns
reassembled into the artifact shape>`), no change to the pure summarizer functions themselves.

(At the time this was written the lane stopped here per the operator's own fallback instruction, since
the table did not exist yet. See the Step 2 UPDATE above and Step 4 below for what happened once the
migration applied.)

The writer and wiring described above are now BUILT (not just sketched):
- `fsi-app/scripts/lib/record-harness-run.mjs` (`recordHarnessRun`, `// SHARED-WRITER: harness_runs`,
  a plain best-effort insert, same posture as `recordApplyRunStart`), plus a CLI (`--file <artifact.json>`)
  for `deliver-artifact-branch.sh` to call. Unit-tested (`record-harness-run.test.mjs`, 4 cases: happy
  path, insert error, client throw, missing-optional-fields defaulting).
- `deliver-artifact-branch.sh` REWRITTEN: the branch-push/`gh pr create`/issue-520 body is gone; it now
  diffs `origin/master...HEAD` for this run's own `scripts/harness-runs/**/*-run-*.json` file(s) and
  calls `record-harness-run.mjs --file <path>` for each. Call signature unchanged
  (`<branch> <title> <body_file>`), so NO `.github/workflows/*.yml` file needed editing. Named residual:
  every calling workflow still runs `git push origin HEAD:"$branch"` immediately before this script,
  which is now a REDUNDANT step (landing is a DB write, not a branch merge); removing that push is a
  follow-up lane's workflow-file edit, out of this lane's scope (this lane was told not to reinvent, and
  keeping the call signature stable was the way to land the DB write with zero workflow diffs).
- The harness-family schedule walker (`harness-family-schedule-walker-audit.mjs`, PR #810) now merges
  `harness_runs` DB rows with local-filesystem artifacts via a new pure adapter `dbRowToArtifactEntry`
  (`harness-family-walk-scan.mjs`), deduped by name. Self-skips to filesystem-only behavior when no DB
  creds are present, preserving the walker's long-standing "no DB" contract for that case. Unit-tested
  (2 new cases in `harness-family-walk-scan.test.mjs`). Ran locally with no creds loaded in this shell:
  completed cleanly (self-skip confirmed), same output shape as before this lane.
- **F50 (`.discipline/fitness/functions/F50-loop-wiring.mjs`) is deliberately NOT wired to the DB in this
  lane.** F50 is a synchronous fitness function that gates every push on every machine (no creds
  guaranteed, no self-skip-on-network-error precedent the way the CI-with-secrets data-audit lane has);
  adding a live network dependency there is a different risk profile than the walker's own DB read and
  deserves its own scoped follow-up, not a bundled add here. Flagged, not silently dropped (rule 13).

## Step 3: one-time import of the 39 stranded branches (dry-run only, drafted and run)

`fsi-app/scripts/turns/import-stranded-harness-branches.mjs` (committed this lane, `--dry` is the only
mode that runs anything; `--apply` refuses with a message pointing at this note, since `harness_runs`
does not exist). Makes no network call beyond `git fetch`/`git ls-remote`/`git show`; no DB call; no
write.

**Dry run, actually executed against origin** [CONFIRMED, live git]:

```
DRY RUN - 39 stranded branch(es) found, 22 artifact row(s) would be inserted:

  change-detection: 5
  gate-a-rescan: 2
  ledger-consume: 7
  source-sweep: 8

Total: 22 row(s) across 4 family(ies). No writes performed (dry mode).
```

**Honest gap, found by running the script, not assumed:** 39 branches exist, but only 22 carry a
`scripts/harness-runs/**/*-run-NNN.json` artifact in their diff against `origin/master`. All 14
`brief-export/*` branches and 3 of 10 `ledger-consume/*` branches add only export-snapshot or other
non-harness-run files (e.g. `brief-export/34686595044` adds six `scripts/_snapshots/brief-export/
export-*-partN.json` files, no `harness-runs/` path at all).

**Coordinator flag investigated, [REFUTED] as a CURRENT emit-step defect** (rule 14: a finding is a
hypothesis until verified, labeled either way; rule 13 corollary: a flag that dissolves under evidence
gets a same-session correction in place). The coordinator's framing was "those runs weren't recorded,
which is a defect in those families' emit steps." Checked both families' current workflow files and the
git history of the harness-run-artifact step itself, not just the branch content:

- All 14 stranded `brief-export/*` branches date 2026-09-12 through 2026-09-18 [CONFIRMED, `git log -1`
  on each branch tip]. brief-export.yml's "Record this run's own harness-run artifact" step was added by
  commit `8c5d1616`/PR **#759** ("Lane M4: brief-export fires after the population turn and leaves its
  own artifact with the loop id"), **2026-09-20** [CONFIRMED, `git log -S "Record this run's own
  harness-run artifact" -- .github/workflows/brief-export.yml`]. Every stranded branch predates the step
  that would have written it by 2 to 8 days. The CURRENT workflow (present on this branch, unmodified)
  does write the artifact on every run since #759.
- All 3 stranded `ledger-consume/*` branches (`33902755838`, `33908401816`, `33929076810`) date
  2026-09-04 [CONFIRMED]. ledger-consume.yml's own header states the export-mode harness-run-artifact
  self-emission ("this mode DOES now self-emit its own `ledger-consume` family harness-run artifact...")
  landed as **Lane LEDGER-CHAIN-2, 2026-09-05** [CONFIRMED, comment cites the lane and date inline at
  `.github/workflows/ledger-consume.yml` next to the `run-ledger-consume.mjs --export-candidates` step].
  These 3 runs predate that lane by exactly one day. The CURRENT workflow does self-emit the artifact
  for export-mode runs.

**Conclusion:** there is no live defect to fix in either family's current emit step - both already write
their harness-run artifact unconditionally (verified by reading the present-day workflow files, not just
inferring from the gap). The 17 orphan branches are pre-feature runs from before each family's
artifact-writing step existed; they are stranded content (real export-candidate / brief-export data with
no matching harness-run record, ever, because none was written), not evidence of an ongoing bug. No code
change is included in this lane for this reason - there is nothing broken to change. Disposition of the
17 orphan branches' actual content (land it some other way, or close the branches) is a separate human
decision, flagged here rather than silently dropped, out of this lane's scope.

## Step 4: TEST FOR REAL - two real bugs found and fixed by actually running it

`gh workflow run gate-a-rescan.yml --ref coord/harness-landing -f mode=dry -f limit=5`, dispatched
against the pushed branch. First dispatch (run 36435442672) went GREEN end to end but
`deliver-artifact-branch: landed=0 failed=0` - the artifact file existed
(`fsi-app/scripts/harness-runs/gate-a-rescan/gate-a-rescan-run-002.json`, confirmed via `git diff`
against that run's own pushed branch) but the script's own file-matching glob found nothing.

**Bug 1 [CONFIRMED, found by actually running it]:** the git pathspec `'**/scripts/harness-runs/*/*-run-
*.json'` matched zero files against that real diff, with or without `:(glob)` magic, tested directly.
Fixed by dropping the leading `**/` (the script always runs from `fsi-app/`, so no extra nesting exists
to match).

Re-dispatched (run 36436680044): now reported `landed=1 failed=0`. Queried `harness_runs` immediately
after - **zero rows**. The "landed" counter was lying: `record-harness-run.mjs` is deliberately
best-effort and exits 0 even when it cannot read/parse the file (so a DB hiccup never fails the calling
workflow), and the bash wrapper was trusting exit code alone as its success signal.

**Bug 2 [CONFIRMED, found by actually running it]:** `git diff --name-only` reports paths relative to
the REPO ROOT by default regardless of the pathspec's own cwd-relative matching, so the path handed to
`node ... --file` was `fsi-app/scripts/harness-runs/gate-a-rescan/gate-a-rescan-run-002.json` while node
ran from cwd `fsi-app/` - an ENOENT the best-effort CLI swallowed silently (exit 0, no row). Fixed two
ways: (1) added `--relative` to the `git diff` call, giving the correct cwd-relative path; (2) stopped
trusting bare exit-code success - the bash wrapper now greps the CLI's own stdout for the
`record-harness-run: landed <id>` marker line before counting a row as landed, so a swallowed failure
inside the best-effort CLI can no longer read as a false green at the shell-script level either.

Both fixes are exactly what "proof by execution, not presence" (rule 15) means in practice: the
migration existing, the writer's unit tests passing, and the first "green" CI run all looked like proof
and were not - the row simply was not there. Recorded here per rule 14 (a finding is a hypothesis until
verified) rather than reporting the first green run as done.

## Step 6: stranded-branch import, real

See the session-log entry for the real (non-dry) import run: 22 records inserted (harness metadata, not
site data, per the operator's framing), counts by family confirmed via a live `select harness_family,
count(*) from harness_runs group by 1` immediately after.
