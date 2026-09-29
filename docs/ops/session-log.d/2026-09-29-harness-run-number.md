# 2026-09-29: Lane HARNESS-RUN-NUMBER (coordinator-confirmed defect, GitHub run 36610847827)

## Defect, as confirmed

Coordinator finding: the Source sweep hop wrote `scripts/harness-runs/source-sweep/source-sweep-run-021.json`;
`deliver-artifact-branch.sh` called `record-harness-run.mjs`, which failed with `duplicate key value
violates unique constraint "harness_runs_pkey"`, logged "best-effort, run continues", printed
`landed=0 failed=1`, and the step concluded SUCCESS. Same shape on Fetch drain (36611354265) and Ledger
consume (36611354387).

## 1. Mechanism, [CONFIRMED] by reading the code

`claimRunId` (`fsi-app/scripts/lib/run-artifact.mjs` lines 474-499, via `highestClaimedOrWrittenRunNumber`
lines 366-394) is what every family runner (`run-source-sweep.mjs`, `run-fetch-drain.mjs`,
`run-ledger-consume.mjs`, and ~25 other callers per `git grep -l claimRunId`) calls to pick its next
`run_id`. It scans TWO things on the local filesystem only: already-written
`scripts/harness-runs/<family>/*.json` artifact files, and `.claims/*.claim` marker directories under the
same tree, both purely local to the current checkout. PR #824 (lane STATUTORY-WRITER, 2026-09-29,
commit range visible in `deliver-artifact-branch.sh`'s own header) removed every `git add`/commit/branch/
push of the harness-run artifact, `deliver-artifact-branch.sh` now lands straight into `harness_runs`
via a DB insert and commits nothing back to the tree. Consequence: every fresh CI checkout after #824 sees
the SAME last-committed artifact (or none) under `scripts/harness-runs/<family>/`, so `claimRunId` hands
out the SAME next number on every run. `harness_runs_pkey`'s unique constraint correctly rejected the
resulting duplicate insert; `record-harness-run.mjs`'s prior posture ("best-effort, run continues",
logged the failure, then unconditionally `process.exit(0)`) swallowed that rejection and reported the step
green. Net effect: nothing has landed in `harness_runs` since 12:43 UTC on 2026-09-29 (the three cited
runs, `landed=0 failed=1` each, step SUCCESS each time), exactly the rule-15 violation named in the brief
("a proof that does not execute is not a proof") and rule-17 ("a runtime that ends without triggering its
downstream is a defect in the runtime").

Two pre-existing, unrelated callers (`plan-quarantine-disposition.mjs`, `write-statutory.mjs`, the
STATUTORY-WRITER lane's own writers) never hit this: they already read `harness_runs` directly via
`nextRunNumberFromHarnessRuns` (`scripts/lib/harness-run-number.mjs`) instead of calling `claimRunId`. The
older family runners (source-sweep, fetch-drain, ledger-consume, and the rest) still go through
`claimRunId`, and those files are outside this lane's write set (`fsi-app/scripts/lib/run-artifact.mjs`
and the ~25 runner callers).

## 2. Fix chosen, and why

**Class fix, scoped to the write set, at the one chokepoint every family's landing already funnels
through post-#824.** Rather than touching `claimRunId` and its ~25 callers (out of this lane's write set),
`record-harness-run.mjs`, the single module every family's artifact passes through to land, now
RENUMBERS the artifact's `run_id` at land time against `harness_runs`' own max for that family, via
`nextRunNumberFromHarnessRuns`/`formatRunId` (`scripts/lib/harness-run-number.mjs`, extended with the new
`formatRunId` helper). The durable record becomes authoritative for "what number is next"; the artifact's
own locally-scanned number is used only as a fallback when the DB read itself fails. This keeps F28's
family-sequence semantics intact (`<family>-run-NNN`, monotonic per family, one row per number, F28's
schema/range/tree-state/proposer-attestation rules all operate on that shape unchanged); only the
AUTHORITY for the number moves, per the brief's own framing. A duplicate-key collision on a DB-derived
number (two landings racing between read and insert) re-derives and retries, bounded at 3 attempts.

**Failure posture, rule 15.** `recordHarnessRun` still never throws, but the CLI (`runCli`, refactored out
of the `isMainModule` block for testability, deps-injected) now returns a non-zero exit for a real
failure: usage error or unreadable/unparseable artifact → 1; missing
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` → 2 (self-skip, never a failure, rule 15's own
"diagnosable, never a false red"); insert failed for any other reason → 1. `deliver-artifact-branch.sh`
now trusts that exit code (`0`=landed, `2`=skipped-not-failed, anything else=failed) instead of the old
"always exit 0, grep stdout for a marker" posture, and the script itself now `exit 1`s when any file
failed to land, so a real landing failure now fails the GitHub Actions step instead of reporting SUCCESS.

## 3. Consumers checked

`grep -rl "deliver-artifact-branch.sh\|record-harness-run.mjs" .github/workflows`: `brief-export.yml`,
`change-detection.yml`, `corpus-turn.yml`, `downstream-chain.yml`, `fetch-drain.yml`, `gate-a-rescan.yml`,
`ledger-consume.yml`, `maintenance.yml`, `population-turn.yml`, `producers.yml`,
`propagation-drain.yml`, `source-sweep.yml`. None of the twelve set `continue-on-error` on the landing
step (`grep -rn continue-on-error .github/workflows/*.yml` finds it only in `discipline.yml`, unrelated).
Every landing step already runs `if: always()` with no exit-code handling of its own, so none of the
twelve relied on, or worked around, the old always-exit-0 behaviour; the new non-zero exit surfaces as
a genuine red step on each of them, which is the intended fix.

Note (not fixed this pass, `git grep`-confirmed, reported honestly): `brief-export.yml`, `ledger-consume.yml`,
`maintenance.yml`, `population-turn.yml` still call `deliver-artifact-branch.sh "$branch" "..."
/tmp/pr-body.md` (the pre-#824, three-argument call shape) even though the script now reads only `$1` as
a label; the extra two arguments are silently ignored (harmless, but stale). Out of this lane's write set
(workflow YAML), named for the coordinator, not silently left undocumented per rule 13.

## 4. Tests

- `fsi-app/scripts/lib/record-harness-run.test.mjs`: original 4 tests unchanged and still pass; added the
  collision/renumber case, the "already-correct-number, no renumber" case, the duplicate-key
  retry-then-land case, the non-collision fail-once case, and 5 `runCli` exit-code tests (no `--file` → 1,
  unparseable file → 1, no creds → 2, real insert failure → 1, real land → 0). 20/20 pass.
- `fsi-app/scripts/lib/harness-run-number.test.mjs` (new, no test file existed for this module before):
  `nextRunNumberFromHarnessRuns` (empty, order-independence, malformed-row skip, family-anchored regex,
  3-digit rollover) and `formatRunId`, all against a fake `readAllFn`, no DB. `buildHarnessRunsClient` is
  deliberately NOT tested here, its real dynamic `import("@supabase/supabase-js")` is unresolvable under
  this file's no-npm discipline-suite membership, same constraint `plan-quarantine-disposition.test.mjs`'s
  own header already documents (that one test lives in its own `.npmtest.mjs` file instead).
- `fsi-app/scripts/turns/deliver-artifact-branch.test.mjs`: existing 8 tests updated for the new
  `{stdout, status}` return shape (was a bare string via `execFileSync`, which throws on nonzero exit , 
  switched to `spawnSync`); the "mixed outcome" test now asserts the script's own exit is non-zero; added
  a new self-skip test (exit 2 → counted as `skipped`, script still exits 0). 8/8 pass.
- `node --test scripts/lib/record-harness-run.test.mjs scripts/lib/harness-run-number.test.mjs
  scripts/turns/deliver-artifact-branch.test.mjs`: 36/36 pass total (SUPABASE_* unset, no real DB
  anywhere in the run).

## 5. Real run (fixture artifact, fake client, no live DB)

`node record-harness-run.mjs` invoked via the exported `runCli()` against a fixture artifact
(`{harness_family: "gate-a-rescan", run_id: "gate-a-rescan-run-012", ...}`) with a deps-injected
`createClientFn` returning a fake `sb` (`fakeSb()` from the test file, `insert` resolves `{error: null}`,
no real network). Read back the row it would insert: `{run_id: "gate-a-rescan-run-012",
harness_family: "gate-a-rescan", github_run_id: "99999", ...}` (see `runCli: a real landed row exits 0`).
Separately, with a fake `readAllFn` reporting `harness_runs` already holding `gate-a-rescan-run-012`/`-013`
for that family, the SAME stale artifact (`run_id: "gate-a-rescan-run-005"`) is renumbered before landing
and the row it would insert reads `run_id: "gate-a-rescan-run-014"` (see
`recordHarnessRun: renumbers against harness_runs' own max+1...`), this is the exact class of collision
the coordinator's finding described, now caught and corrected before the insert rather than after.

## Migration/schema note (coordinator's to apply, SQL only, no migration file created here)

An index on `harness_runs(harness_family, run_id)` would make the per-family max lookup
`nextRunNumberFromHarnessRuns` performs on every landing an index scan rather than a filtered seq scan.
Not required for correctness (the table is small and `run_id` is already the primary key, so a
`harness_family` filter over it is already selective), offered as a low-cost optimization if landing
volume grows:

```sql
CREATE INDEX IF NOT EXISTS harness_runs_family_run_id_idx
  ON harness_runs (harness_family, run_id);
```

## Residual, not this lane's write set

`claimRunId` (`fsi-app/scripts/lib/run-artifact.mjs`) and its ~25 family-runner callers still claim their
OWN local-scan number before ever reaching `record-harness-run.mjs`, this lane's fix corrects the number
at the landing chokepoint (authoritative, closes the defect), but the local claim itself is still stale
data every one of those runners logs/uses internally (e.g. in `per_item`/log lines) before landing. A
follow-up lane could point `claimRunId` at `harness_runs` directly (same `nextRunNumberFromHarnessRuns`
helper, now exported alongside `formatRunId`) to remove the now-redundant local scan entirely; flagged,
not fixed here, because `run-artifact.mjs` is outside this lane's write set.

Ready for pre-push.
