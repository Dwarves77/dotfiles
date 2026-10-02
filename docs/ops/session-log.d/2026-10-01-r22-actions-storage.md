# Lane R22 (ACTIONS-STORAGE-AND-DOCS-ONLY-PUSH), 2026-10-01

Remediation plan operator-approved 2026-10-01 ("fixed, not worked around"). Coordinator facts at
dispatch: 311 artifacts, 6.2 GB, all September, every turn uploading its whole `fsi-app/scripts/_snapshots/`
directory at 90-day retention in 13 workflows; coordinator cleanup deleted 290 artifacts older than 3
days, leaving 0.43 GB.

## Task (a): retention and upload-path remediation

Every `.github/workflows/*.yml` file in the repo was read in full (all 22), plus
`fsi-app/.discipline/hooks/pre-push`, `F54-push-gate-npm-parity.mjs`, and
`scripts/turns/deliver-artifact-branch.sh` per the dispatch's required reading. `grep -rn
"download-artifact" .github/workflows/` returned zero matches: no workflow consumes another's uploaded
artifact, so part (a)'s "keep exactly what it consumes" clause does not apply anywhere.

14 workflows upload artifacts (13 named by the coordinator, plus `producers.yml`, which uploads two small
named files with no explicit `retention-days` and so was silently inheriting the repository's 90-day
default). Edited all 14:

| Workflow | Retention before -> after | Path narrowing |
|---|---|---|
| `brief-apply.yml` | 90 -> 7 | dropped the whole `scripts/_snapshots/` entry; kept `harness-runs/brief-apply/` + `/tmp/*.log` |
| `brief-export.yml` | 90 -> 7 | `scripts/_snapshots/brief-export/` -> `scripts/harness-runs/brief-export/` (the export part file is already durable via the git-branch commit the same step makes) |
| `change-detection.yml` | 90 -> 7 | unchanged (already scoped to `harness-runs/change-detection/traces/`) |
| `corpus-turn.yml` | 90 -> 7 | dropped the whole `scripts/_snapshots/` entry; the forward-events full-trace files moved from `scripts/_snapshots/turn-<run_id>/` to `scripts/harness-runs/corpus-turn/traces/turn-<run_id>/` (same survivability for `full_trace_refs`, no `_snapshots` substring); upload path is now `harness-runs/corpus-turn/` + `harness-runs/forward-events/` |
| `date-chain.yml` | 90 -> 7 | dropped the whole `scripts/_snapshots/` entry (this family emits no harness artifact; kept `/tmp/*.log`, its only summary) |
| `downstream-chain.yml` | 90 -> 7 | unchanged (already scoped to its own `runner.temp` output root) |
| `fetch-drain.yml` | 90 -> 7 | `scripts/_snapshots/` -> `scripts/harness-runs/fetch-drain/` |
| `gate-a-rescan.yml` | 90 -> 7 | unchanged (already scoped to its own `runner.temp` output root) |
| `ledger-consume.yml` | 90 -> 7 | `scripts/_snapshots/` -> `scripts/harness-runs/ledger-consume/` (the export candidates file, when produced, is already durable via the git-branch commit the same step makes) |
| `maintenance.yml` | 90 -> 7 | unchanged (already scoped to its own `runner.temp` output root) |
| `population-turn.yml` | 90 -> 7 | `scripts/_snapshots/` -> `scripts/harness-runs/mint/` + `forward-events/` + `ledger-consume/` (the three families this dispatch can touch; export/report files are already durable via the git-branch commit the same step makes) |
| `producers.yml` | (none) -> 7 | unchanged paths (already single named files, not `_snapshots`); added the explicit value |
| `source-monitoring.yml` | 90 -> 7 | unchanged (already a named `dossiers/` output, not `_snapshots`) |
| `source-sweep.yml` | 90 -> 7 | `scripts/_snapshots/` -> `scripts/harness-runs/source-sweep/` |

`[CONFIRMED]` (method: `node .discipline/fitness/functions/F68-actions-artifact-budget.mjs` logic run
against every workflow after the edits, and a repo-wide grep of every `actions/upload-artifact` block for
`_snapshots`/`scripts/tmp`): zero remaining `retention-days` above 7 and zero upload path containing
`_snapshots` or `scripts/tmp` anywhere in `.github/workflows/`.

## Task (b): F68 fitness function

Added `fsi-app/.discipline/fitness/functions/F68-actions-artifact-budget.mjs` (registered automatically
by the manifest-directory convention, no list to edit) + `F68-actions-artifact-budget.test.mjs`.
Fails if any `actions/upload-artifact` step sets `retention-days` above 7, or its `path:` value (inline or
block-scalar) contains `_snapshots` or `scripts/tmp`. Negative-tested: a 90-day-retention fixture fails, a
`_snapshots`-path fixture fails (both inline and inside a block scalar), a `scripts/tmp`-path fixture
fails, the clean matching pair passes, and a live-tree proof (`fitnessFunction.check()` against the real
`.github/workflows/`) returns zero violations post-remediation.

Correction, same session: the first `node fsi-app/.discipline/governance/invariant-coverage.mjs` run
FAILED with `ORPHAN MECHANISM: fitness F68 exists but no invariant references it`, a consequence of
registering F68 this lane had not anticipated. Fixed by adding
`fsi-app/.discipline/governance/invariants.d/RD-86-actions-artifact-budget.mjs`, extending category 37
("A perf number in CI carries a ratchet, a target, and dated evidence") from perf numbers to Actions
artifact storage budgets, `enforcedBy: ['fitness:F68', 'selftest:...F68-actions-artifact-budget.test.mjs']`.
RD-86 was a self-assigned id (`invariants.d/README.md`: "the coordinator assigns the id"; this lane's
dispatch did not anticipate the meta-gate consequence, so no id was pre-assigned). The first attempt also
hit an `ANCHOR DRIFT` (the category 37 heading uses a literal em dash, U+2014; the first draft used a
plain hyphen), fixed by matching the heading byte-for-byte with a `glyph:verbatim` marker, the same
convention every other carried-over anchor/section field in that directory already uses.
`invariant-coverage.mjs` then reported `ALL 144 invariants + 63 doctrines are wired ... meta-gate PASS`.

**Second correction, coordinator-directed, 2026-10-02**: RD-86 was already taken
(`RD-86-workflow-run-chain-depth.mjs`, lane LOOP-B-FIRING, F60) and invariants on master already run to
RD-87, with lane R6-8 holding RD-88 and RD-89. Renamed the file and `id` to `RD-90-actions-artifact-budget`
(coordinator-assigned) throughout; `git mv`, no content change beyond the id/filename and this file's own
header comment. `invariant-coverage.mjs` re-run clean under the new id (see Gates run).

## Task (c): docs-only push fast path

Read `docs/dispatches/lane-common-contract.md` and discipline.yml's own 2026-08-12 header in full before
touching either surface: that header explicitly REJECTED path-filtering at the workflow TRIGGER level
("a skipped required check reports neither success nor failure... branch protection blocks the merge
forever"). This lane's filter is a different mechanism: a step INSIDE an already-running job decides
whether to skip that job's own LATER, heavy steps; the job itself still runs its Checkout/Setup Node/
`docs_only`-resolving steps and always reports a real pass or fail, so the hazard that header warned
about does not apply here. Documented this distinction inline in both files so a future reader does not
re-litigate it.

Built one shared primitive, `fsi-app/.discipline/governance/docs-only-range.mjs` (+ `.test.mjs`), the ONE
home both surfaces call (the same "two surfaces cannot drift" pattern `memory-gate.mjs` / `override-check.mjs`
/ `run-test-suite.sh` already use in this repo): `isDocsOnlyDiff` is true only when every changed file in
a git range matches `docs/**` or `*.md`, false on an empty diff (not vacuously true).

- `fsi-app/.discipline/hooks/pre-push`: new step 0c computes `DOCS_ONLY` via the shared primitive over
  `origin/master..HEAD`, right after step 0b. Steps 1, 2, 2b, 2c (untracked-critical gate, the
  consistency runner, the memory gate, the discipline rules in CI mode, which run rule 022 and rule 014)
  still run unconditionally. Steps 3 through 4 (the test suite, every meta-gate, npmtest, goldens, tsc)
  are now wrapped in one `if [ "$DOCS_ONLY" != "true" ]; then ... fi` guard, chosen over restructuring
  each step individually so every step body stays byte-for-byte what it was before this lane.
- `.github/workflows/discipline.yml`: added a "Resolve docs-only fast path" step (same shared primitive,
  same push/pull_request range-resolution shape the existing Memory-gate step already uses) to both
  `test-discipline-engine` and `fitness-check`, and gated their heavy steps (`run-test-suite.sh`,
  invariant-coverage, closure gate, skill-contract drift, orphan census, `npm ci`, the fitness runner,
  actionlint, npmtest, goldens) on `steps.docs_only.outputs.docs_only != 'true'`. `validate-commits` and
  `consistency-backstop` (the jobs that already run only the rule engine + consistency runner) were left
  untouched; they are the "rule checks" the dispatch names. `fitness-check`'s checkout gained
  `fetch-depth: 0` (was an implicit shallow default), needed for the new step's git diff.

`[CONFIRMED]` F54 (push-gate-npm-parity) required no extension: its 26 unit tests, including the LIVE
proof against the real `discipline.yml` + `pre-push`, all pass unchanged after these edits. Reasoning:
F54 is a textual scan for whether a CI step's script is ALSO called somewhere in `pre-push`'s text; adding
a runtime `if:` condition to a step, or a shell `if` guard around a call, does not remove the script path
from either file's text, so parity holds by construction. Also re-ran F52 (workflow-file-validity): live
check against the real tree returns zero violations (confirms the new `steps.docs_only.outputs...` `if:`
conditions and the new `id: docs_only` steps are structurally valid per that gate's checks a-h).

Negative-tested both required cases directly against `isDocsOnlyDiff`/`isDocsOnlyPath` (not full
end-to-end CI/hook runs, which this lane does not trigger): a docs-only fixture list (`docs/*.md`,
`CLAUDE.md`) returns true; a mixed fixture list (one docs file + `.github/workflows/discipline.yml`)
returns false. The CLI was also run live against this lane's own branch diff
(`origin/master..HEAD`), which correctly returned `docs-only: false` (the diff touches workflow YAML and
`.discipline/` code, not only docs).

## Task (d): fleet-budget-control.md runbook entry

Added a "GitHub Actions artifact storage budget" section to `docs/runbooks/fleet-budget-control.md`
(prior-art check: this is the existing home for platform-budget runbooks per the lane dispatch and
`docs/INDEX.md`; extended rather than creating a new doc).

`[CONFIRMED]` (method: `gh api repos/Dwarves77/dotfiles/actions/artifacts --paginate`, read-only, run
2026-10-02): the post-cleanup live state is 21 artifacts, 411.8 MB total (close to the coordinator's
reported 0.43 GB), broken down per workflow-prefix in the runbook's table. Finding recorded there: every
`*-snapshots` artifact is within half a percent of the same ~47.8 MB regardless of which family uploaded
it, because `fsi-app/scripts/_snapshots/` is one flat, shared directory (`db.mjs`'s `snapDir()`), not
scoped per family, so the "13 workflows" were each uploading a near-duplicate of the same contents.

`[HYPOTHESIS]` (method: average size of the already-committed `scripts/harness-runs/<family>/*-run-*.json`
files on disk per family): the expected post-fix per-run artifact size is roughly 11 KB to 55 KB
depending on family, 880x to 4,300x smaller than the ~47.8 MB bulk upload it replaces. Labeled a
hypothesis, not confirmed, because this lane does not push: a real before/after pair from `gh api` on the
next live run of each workflow belongs in that table once someone can read it back.

## UX compliance

Not applicable. No `.tsx`/`.css` file was touched by this lane.

## Gates run

- `node fsi-app/.discipline/fitness/functions/F68-actions-artifact-budget.test.mjs`: 12/12 pass.
- `node fsi-app/.discipline/fitness/functions/F54-push-gate-npm-parity.test.mjs`: 26/26 pass (no
  extension needed).
- `node fsi-app/.discipline/fitness/functions/F52-workflow-file-validity.test.mjs`: 34/34 pass.
- `node fsi-app/.discipline/governance/docs-only-range.test.mjs`: 9/9 pass.
- `node fsi-app/.discipline/fitness/manifest.test.mjs`: 5/5 pass (F68 registers cleanly, no duplicate-id,
  no filename mismatch).
- `node fsi-app/.discipline/governance/invariants.test.mjs`: 59/59 pass across the five targeted files
  together (includes the live-load proof that `invariants.d/` still loads cleanly with the invariant
  added, first as RD-86, then renumbered to RD-90 per the coordinator's correction below).
- `node fsi-app/.discipline/fitness/runner.mjs` (full live-tree run): "Fitness summary: 53 function(s)
  checked, 0 violation(s)."
- `node fsi-app/.discipline/governance/invariant-coverage.mjs`: "ALL 144 invariants + 63 doctrines are
  wired ... meta-gate PASS" (after the RD-86 correction above, and again after the RD-86 -> RD-90
  rename below; the very first run of this gate, before either invariant existed, FAILED, see Task (b)).
- `node fsi-app/.discipline/governance/closure-gate.mjs`: PASS on all four checks (NEVER-RUN, STALE-NEXT,
  WRITER-READER, LANE-CONTRACT).
- `node fsi-app/.discipline/governance/skill-contract-map.mjs --check`: "OK, 6 registered skills, no
  drift."
- `bash fsi-app/.discipline/run-test-suite.sh` (full canonical suite, touched-tests-only was not possible
  since this lane's own write set spans both touched functions and the shared test-discovery glob): ran
  twice before the rebase below; 6257+2094 node:test cases, exactly one failure both times, which was the
  `invariant-coverage.test.mjs` ORPHAN MECHANISM finding above (this lane's own F68 registration), fixed
  by the invariant now named RD-90, not re-run to full completion a third time after either fix per the
  coordinator's explicit "do not run the full suite again" (the targeted re-runs listed above and in the
  addendum below cover the changed surface; both fixes are pure additions/renames with no other file
  touched).
- `node fsi-app/.discipline/runner.mjs --mode=ci --range=origin/master..HEAD`: 1 pass, 0 fail, 9 skip,
  both before commit and after the rebase below.
- Rule 022 (no dash glyphs): every file this lane touched was scanned for U+2014/U+2013/U+00A7 on ADDED
  lines only (the rule's own trigger shape, and the same check the commit-msg hook ran live on this
  lane's actual commits); all found instances were rewritten with commas or periods, except the two
  literal em dashes the RD-90 invariant's `section`/`anchor` fields must carry to match the cited skill
  heading byte-for-byte, disclosed with `glyph:verbatim` per the rule's own escape hatch.

## Rebase

This worktree's local `origin/master` ref was stale at dispatch time (4 commits behind the real remote,
other lanes' merges this session never fetched): a first `runner.mjs --mode=ci` run over
`origin/master..HEAD` showed 5066 added-line glyph violations and 128 changed files this lane never
touched, all belonging to other lanes' already-merged work, not a real finding against this lane's own
diff. `git fetch origin && git rebase origin/master` after committing resolved cleanly (0 conflicts); the
rule-engine and gate re-runs above are all against the rebased state.

## Coordinator corrections, 2026-10-02 (addendum)

Two corrections landed after the report above; both addressed in this same commit range.

**(1) RD-86 renumbered to RD-90.** RD-86 was already taken on master
(`RD-86-workflow-run-chain-depth.mjs`, lane LOOP-B-FIRING, F60) at the time this lane self-assigned it;
invariants on master already run to RD-87, and lane R6-8 holds RD-88 and RD-89. `git mv` to
`RD-90-actions-artifact-budget.mjs`, `id` field updated to match (the filename-stem-equals-id rule
`invariants.d/README.md` states), no other content change beyond the file's own header comment
explaining the rename. `node fsi-app/.discipline/governance/invariant-coverage.mjs` and
`node fsi-app/.discipline/governance/invariants.test.mjs` both re-run clean under the new id (59/59 and
"ALL 144 invariants + 63 doctrines are wired ... meta-gate PASS").

**(2) Removed the dead git branch-push steps in `brief-export.yml`, `ledger-consume.yml`,
`population-turn.yml`, and `maintenance.yml`.** Each used to run `git checkout -b` / `git commit` /
`git fetch --depth=50 origin master && git rebase` / `git push origin HEAD:<branch>` immediately before
calling `scripts/turns/deliver-artifact-branch.sh "$branch" "<title>" /tmp/pr-body.md` with two extra
positional arguments. `deliver-artifact-branch.sh`'s own header (rewritten lane STATUTORY-WRITER,
2026-09-29) states it does "no git add, no branch, no commit, no fetch, no rebase, no push, no PR,
anywhere in this pipeline" and takes a single `<label>` argument for logging only; the extra arguments
were silently ignored (the script only reads `$1`), and the branch/commit/push code ran independently of
the call, still pushing branches nobody reads per the operator's own quoted ruling ("not once that I
need a pull request from GitHub"). Replaced each with the single-label call shape every other caller in
this repo already uses (`change-detection.yml`, `corpus-turn.yml`, `fetch-drain.yml`,
`gate-a-rescan.yml`, `source-sweep.yml` were the templates read).

`[CONFIRMED]` one of the four removals also closed a real staleness bug, not only dead code:
`brief-export.yml`'s "Record this run's own harness-run artifact" step was passing
`BE_BRANCH: brief-export/${{ github.run_id }}` to `emit-brief-export-artifact.mjs`, which recorded that
value as the harness artifact's own `branch` field. With no branch pushed, that field would have asserted
a branch existed when it did not; removed the env var so the script's own `branch || null` default
records the honest `null`.

`[CONFIRMED]` the maintenance.yml removal is ALSO closing dead code, not regressing a fix:
the original reason that step committed `scripts/harness-runs/quarantine-disposition` (lane
QUARANTINE-DISPOSITION, 2026-09-28: a stale local checkout made `claimRunId` re-claim the same run
number, colliding on `harness_runs`' primary key) was itself superseded the next day by lane
HARNESS-RUN-NUMBER (2026-09-29, GitHub run 36610847827): `record-harness-run.mjs` now renumbers every
landing against `harness_runs`' own live max, never a filesystem scan
(`scripts/lib/harness-run-number.mjs`'s own header: "harness_runs is the durable record ... the local
scan is now only ever a fallback"). The collision class does not need a git-committed directory to stay
fixed.

**[HYPOTHESIS], flagged not fixed, two residual risks named in the workflow files themselves (not
silently dropped):**
- `population-turn.yml` also used to commit `scripts/turns/brief-export/pending/` (its own tracked,
  non-gitignored README.md; task 3.5 step 12's queue for a session lane to drain) in the SAME step as the
  dead `_snapshots`/harness-runs commits. That directory is a real, currently-functioning delivery
  mechanism, not scratch; removing its push means a newly-queued part this run writes there no longer
  reaches origin by any path (it was never an Actions artifact either).
- `maintenance.yml` also used to commit `../docs/ops/dispatch-ledger.jsonl` (82 committed lines today,
  read by `fsi-app/.discipline/governance/closure-gate.mjs`'s NEVER-RUN check and
  `scripts/lib/assemble-train.mjs`'s train-numbering) in the same step. Removing its push means a row a
  maintenance run appends locally never reaches origin, so the next checkout's closure-gate and
  train-numbering permanently miss that run.

This lane executed the coordinator's instruction uniformly across all four files as given ("operator
standard"), and both risks are disclosed inline in the edited workflow files themselves (not only here),
but did not independently verify either specific consequence is intended before executing. Named here for
the coordinator or operator to confirm or route to a follow-up lane.

Gates re-run after both corrections: `F54-push-gate-npm-parity.test.mjs` 26/26,
`F50-loop-wiring.test.mjs` 13/13 (including its own LIVE zero-violations check), `F68-actions-artifact-
budget.test.mjs` 12/12, `F52-workflow-file-validity.test.mjs` 34/34 (85/85 together), all pass. Rule 022
scanned on every added line across all four edited workflow files plus this addendum: clean. Per the
coordinator's explicit instruction, the full `run-test-suite.sh` was NOT re-run a third time.

## Coordinator corrections round 2, 2026-10-02: closing both flagged consequences

The coordinator directed this lane to close both consequences flagged above, under the standing PR #824
/ rule 17 ruling (no artifact branches or Actions PRs; `harness_runs` is the durable record), rather than
leave them open for a follow-up lane.

**(1) `population-turn.yml`'s `scripts/turns/brief-export/pending/` queue.** Read
`scripts/turns/run-population-flywheel.mjs` (step 12, `stepBriefExport`/`buildBriefExportArgs`) and
`scripts/turns/apply-record-briefs.mjs` end to end, plus `scripts/turns/brief-export/pending/README.md`
and `scripts/harness-runs/brief-export/family.json`. What the queue carried between the two runtimes
(export-corpus-for-extraction.mjs's numbered parts: each minted item's stored claims/sections + full
captured `agent_run_searches` pool text) now rides a `brief-export` family `harness_runs` row's own
`inputs_ref` column (migration 331), never a tracked file:

- New `fsi-app/scripts/turns/brief-export/queue.mjs`: `readExportedParts` (reads the numbered parts back
  off disk after `export-corpus-for-extraction.mjs` writes them), `buildQueueArtifact` (the row, pure),
  `isPendingQueueRow`/`pendingQueueRows` (the consumer-side correlation: a row is pending until every id
  it queued appears in some later `brief-apply` family row's own `per_item`, success or failure --
  `[HYPOTHESIS]`, named in that function's own header, labeled id-coverage not outcome-correctness).
- `run-population-flywheel.mjs`'s `stepBriefExport` (producer end): writes its export parts to a NEW
  gitignored scratch path (`scripts/_snapshots/brief-export-queue/`, was the tracked `scripts/turns/
  brief-export/pending/`), reads them back, and lands the `brief-export` family row LOCALLY via the SAME
  `writeRunArtifact` every sibling family step already uses -- `population-turn.yml`'s existing harness-
  landing step already globs every family under `scripts/harness-runs/*/*-run-*.json`, so no workflow
  change was needed for this row to reach `harness_runs`.
- New `fsi-app/scripts/turns/read-brief-export-queue.mjs` (consumer end): `--list` (every still-pending
  row) / `--run-id <id>` (one row's queued content as JSON) against `harness_runs`, read-only by
  construction (no write path exists at all -- "drained" is the pure correlation above, never a
  mutation). Deps-injected, self-skips exit 2 without credentials.
- `scripts/verify/population-report.mjs`'s "briefs pending" entry: corrected the now-stale hint text
  (pointed a reader at the retired file path) to name the new CLI, and [REFUTED, corrected in place per
  rule 13's corollary] the entry's own prior `[HYPOTHESIS]` visibility caveat, whose premise (an unmerged
  `population/<run_id>` artifact branch) no longer exists after this and the prior round's commits.

`[CONFIRMED]` by REAL (non-mocked) proof, not only unit tests: built a fixture export batch on real disk,
ran `readExportedParts` + `buildQueueArtifact` + the real `writeRunArtifact`/`validateRunArtifact` from
`run-artifact.mjs` against it. First attempt THREW inside `writeRunArtifact`: `full_trace_refs must be
non-empty`, a real defect the proof caught (`buildQueueArtifact` was passing `[]`); fixed by pointing
`full_trace_refs` at `queue.mjs` itself (the file that explains why there is no separate trace file any
more), the same self-referential shape emit-brief-export-artifact.mjs's own batch-less fallback already
uses. Re-ran clean; added a regression test (`validateRunArtifact(artifact)` returns `[]`) so this cannot
silently regress. Also ran the real consumer CLI with no credentials present (`node scripts/turns/
read-brief-export-queue.mjs --list`): self-skipped exit 2, the real wiring, not a mock.

**(2) `maintenance.yml`'s `docs/ops/dispatch-ledger.jsonl`.** Read `closure-gate.mjs`'s NEVER-RUN check
(`gatherNeverRunTargets`, `readDispatchLedger`) and `db-catalog.json`/`db-catalog-refresh.sql` (the
"committed snapshot, credentialed refresh, secret-less check" precedent this now follows) end to end.

- New `fsi-app/scripts/lib/export-harness-ledger.mjs`: one read-only SELECT against `harness_runs`
  (family, run_id, started_at, finished_at, trigger, config only -- never `per_item`/`inputs_ref`/
  `metrics`/`defects_found`/`full_trace_refs`, keeping the export small), writes a committed JSON
  snapshot (`fsi-app/.discipline/governance/harness-ledger-export.json`). Deps-injected, self-skips exit
  2 without credentials -- proved for real: `node scripts/lib/export-harness-ledger.mjs --out ...`
  self-skipped exit 2 in this worktree (no DB credentials here by design).
- `closure-gate.mjs`: `readDispatchLedger()` (read `docs/ops/dispatch-ledger.jsonl`) replaced with
  `readHarnessLedgerExport()` (reads the new committed export; an absent or malformed file is zero
  evidence from this source, never a hard failure, the SAME graceful-absence posture the retired reader
  had). Both call sites in `gatherNeverRunTargets()` updated: the maintenance per-step correlation now
  matches `row.family === 'maintenance' && (row.config?.step === step || row.config?.step === 'all') &&
  row.finished_at` (named simplification: the old `outcome !== 'error'` distinction is not reproduced,
  since a `write-run-artifact.mjs` row lands `if: always()` regardless of a sub-step's exit code --
  "landed" is weaker evidence than "landed with no error", accepted in exchange for a live, never-stale
  source); the other-dispatchable-workflows correlation now joins on `family` (the SAME key
  `harnessArtifactExists` already resolves two lines above) instead of a `workflow` name field that
  never existed on a `harness_runs` row.
- `maintenance.yml`: removed the "Append this run's dispatch-ledger row" step entirely (the
  `node scripts/harness-runs/append-dispatch-ledger.mjs ... --ledger ../docs/ops/dispatch-ledger.jsonl`
  call). The file itself is left in place, untouched, as a historical record (not deleted), matching
  CLAUDE.md's own `fsi-app/STATUS.md` "retain, mark historical" precedent -- nothing here marks it
  historical in text since the coordinator's instruction did not ask for that, only that maintenance.yml
  stop writing it; named as a residual below.
- `docs/runbooks/fleet-budget-control.md`: new "Harness-run dispatch-evidence export" section records
  the standing rule verbatim as directed -- the coordinator's DB executor regenerates
  `harness-ledger-export.json` each session.

`[CONFIRMED]` by running the LIVE `closure-gate.test.mjs` suite before and after: the swap immediately
red-flagged two REAL, pre-existing gaps neither this lane nor any prior one had caught --
`downstream-chain.yml` and `producers.yml` each register their own harness family (confirmed by reading
each workflow's own header/deliver-artifact-branch.sh call) but were missing from `closure-gate.mjs`'s
`HARNESS_FAMILY_BY_WORKFLOW` map, so `harnessArtifactExists` could never see either one; the retired
jsonl's own stale, hand-written `workflow:` rows happened to carry evidence by workflow name, masking the
gap for as long as those 11-day-old rows existed. Fixed both mappings in the same commit. Since neither
family has a historical git-tracked artifact AND the new export does not exist yet (no DB credentials in
this worktree to generate a real one -- CLAUDE.md rule 2, never fabricate rows), added two dated
`NEVER_RUN_ALLOWLIST` entries (expiry train 80, current train 71) naming exactly this bridging reason,
removed automatically by the gate's own allowlist-staleness audit once a real export lands and either
workflow's own dispatch evidence resolves for real.

`node fsi-app/.discipline/governance/closure-gate.test.mjs`: 34/34 pass, including all 5 LIVE checks
(NEVER-RUN, STALE-NEXT, WRITER-READER, LANE-CONTRACT, the combined gate) and the allowlist-shape audit.

**Residuals, named not silently dropped:**
- `fsi-app/scripts/harness-runs/append-dispatch-ledger.mjs` has no caller left anywhere in this repo
  (only `maintenance.yml`'s own removed step ever called it). It was NOT deleted, and NOT added to
  F25's `LEGACY_ALLOWLIST` -- genuinely dead code this lane leaves named rather than silently dropped or
  silently exempted; its own `append-dispatch-ledger.test.mjs` still passes (proves the row-builder
  works, proves nothing about whether anything calls it), which is exactly the class rule 15 warns
  against if left unaddressed long. A follow-up lane's call: delete both files, or find a genuine second
  caller.
- `fsi-app/.discipline/governance/harness-ledger-export.json` does not exist yet in this commit. Every
  consumer (`closure-gate.mjs`) treats its absence as zero evidence, never a crash (proved by the LIVE
  test suite passing against the real, file-less tree); the two `NEVER_RUN_ALLOWLIST` entries above are
  the named, dated bridge until the coordinator's DB executor runs the first real regeneration.
- `fsi-app/scripts/turns/read-brief-export-queue.mjs` carries a new, dated `F25` `LEGACY_ALLOWLIST`
  entry (genuinely operator/session-lane-invoked, no workflow caller by design, no write path to wire
  into one either).

## Ready to push

Awaiting "Released."
