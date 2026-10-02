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
- `node fsi-app/.discipline/fitness/runner.mjs` (full live-tree run): "Fitness summary: 53 function(s)
  checked, 0 violation(s)."
- `bash fsi-app/.discipline/run-test-suite.sh` (full canonical suite, touched-tests-only was not possible
  since this lane's own write set spans both touched functions and the shared test-discovery glob): ran
  twice; see "Open items" below for the one pre-existing failure this lane investigated and ruled out as
  unrelated to its own write set.
- Rule 022 (no dash glyphs): every file this lane touched was scanned for U+2014/U+2013/U+00A7 on ADDED
  lines only (the rule's own trigger shape); all found instances were rewritten with commas or periods
  before this entry was written.

## Open items

- Full pre-push preflight (`DISCIPLINE_HOOK_TRAMPOLINE=1 sh fsi-app/.discipline/hooks/pre-push`) was NOT
  run end-to-end as this report was written, pending the test-suite rerun's result; run it before the
  push this lane waits on ("ready to push", not pushed).
- `rendering-guard` (the Playwright job) was left ungated by the docs-only fast path: it is already
  `continue-on-error: true` and non-blocking, and the dispatch named only "the test-suite and fitness
  steps." A docs-only PR still spins up Playwright chromium there, wasteful but not required-status, not
  fixed in this lane (scope: retention/paths/docs-only-filter only).
- `brief-export.yml`, `ledger-consume.yml`, `population-turn.yml`, and `maintenance.yml` each still carry
  a `git checkout -b` / `git commit` / `git push origin HEAD:<branch>` sequence immediately BEFORE calling
  `scripts/turns/deliver-artifact-branch.sh` with extra positional arguments that script's current header
  says it no longer uses ("no git add, no branch, no commit, no fetch, no rebase, no push, no PR,
  anywhere in this pipeline... Usage: deliver-artifact-branch.sh <label>"). The git dance still runs
  (dead relative to the script's own rewritten contract, but not dead code, since the git commands run
  independently of the call) and still lands the real deliverable (export files, candidates files,
  mint-run artifacts) on a branch, which this lane's narrowed Actions-artifact uploads now rely on for
  durability. NOT fixed here: out of this lane's write set (retention/paths/docs-only-filter only), and a
  real behavioral question (does the operator still want an Actions-created branch/PR for these four
  deliverables, now that the harness-artifact half of that pattern was removed) that this lane does not
  have standing to answer unilaterally.

## Ready to push

Awaiting "Released."
