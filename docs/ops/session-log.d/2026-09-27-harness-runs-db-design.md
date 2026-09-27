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

## Step 2: the table is missing. Migration sketch (DDL only, NOT applied)

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

Per the operator's own fallback instruction, this lane STOPS here rather than writing code against a
table that does not exist yet: writing `record-harness-run.mjs` or wiring the walker/F50 to a query
against `harness_runs` now would (a) fail the repo's own schema-drift audit
(`fsi-app/scripts/verify/schema-drift-audit.mjs`) on the very next pre-push, and (b) be unverifiable
without the table to test against. Step 4 (dispatch a real workflow and show the row land) is deferred
to the lane that applies this migration.

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

## Step 4: TEST FOR REAL - stopped

Per the operator's own instruction ("if that needs the migration first, stop at step 2's sketch"): this
lane stops here. Dispatching `gate-a-rescan.yml` in dry mode now would still hit the OLD
`deliver-artifact-branch.sh` path (branch push + refused PR + issue-520 comment), because the new
writer and the migration are, correctly, not yet built or applied. A real test of the new path needs, in
order: (1) apply the `harness_runs` migration above, (2) land `record-harness-run.mjs` and the
`deliver-artifact-branch.sh` replacement, (3) then dispatch `gate-a-rescan.yml --ref coord/harness-landing
-f mode=dry -f limit=5` and confirm a row lands in `harness_runs` with that run's `github_run_id`.
