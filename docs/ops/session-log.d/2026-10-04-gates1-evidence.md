## 2026-10-04, lane gates1-evidence: gates read the evidence that actually exists

Accomplished
- Item 1, smoke test noise. New `fsi-app/.discipline/fitness/lib/selftest-spawn.mjs` is the one way F10, F11 and F12 run their selftest subprocess (three verbatim copies removed). When `jiti` does not resolve from fsi-app (a job that never ran `npm ci`) it logs `[Fn] SKIP: <reason>` and passes; a selftest that runs and exits non-zero, or exits on a signal, is still a violation; a missing selftest file is always a violation. F9 does the same for an unresolvable `tsc` (`TSC_NOT_FOUND` becomes a SKIP line, a tsc that runs and fails is still a violation). `runner.test.mjs` smoke test now runs the npm-free subset F2, F6, F8 with child stderr captured, plus a test that runs F9 to F12 under the no-npm sandbox and asserts exit 0, a SKIP line each, and no `FAILED` text.
- Item 2, loop firing evidence. `loop-manifest.mjs` gained `FIRED_TRIGGERS`, `LOOP_FIRED_EVIDENCE_PATH`, `LOOP_FIRED_EVIDENCE_FILE`, `PRODUCER_FAMILY_BY_WORKFLOW_FILE`, `producerFamilyOf` and the pure `mapRowsToHops`. New `scripts/verify/export-loop-fired-evidence.mjs` (dry by default, `--write` writes, exit 2 without credentials). F50 treats a hop as fired when a committed artifact carries the trigger OR the evidence file has an entry for it; an entry for an unknown hop, a family that is not the hop's family, or a non-fired trigger is a violation, as is a corrupt or shapeless file. New hard data-audit `scripts/verify/loop-fired-evidence-audit.mjs` (label `loop-fired-evidence`, registered by its marker, which is how run-data-audit-lane.mjs derives its list; the lane file itself was not edited). Committed `fsi-app/.discipline/governance/loop-fired-evidence.json` as `{ "entries": [] }`. No `enforceFired` flag flipped, nothing written from a database.
- Item 4 is a report only (see the lane report). Item 3 is NOT done (see below).

Command the coordinator's executor runs to produce the evidence file (needs `fsi-app/.env.local` or the SUPABASE variables):
`node fsi-app/scripts/verify/export-loop-fired-evidence.mjs --write`, then commit `fsi-app/.discipline/governance/loop-fired-evidence.json`. Run without `--write` first to see FIRED, none and UNMAPPED lines.

Read and reused
- `export-harness-ledger.mjs` (committed-snapshot pattern, `readAll`, `runCli` shape), `record-harness-run.mjs` (the `harness_runs` columns: `harness_family`, `run_id`, `started_at`, `trigger`, `github_run_id`, `upstream_run_id`), `run-artifact.mjs` (trigger values), `resolve-dep.mjs` (`tryResolveAppDep`, the one way to ask whether a dependency resolves; F59), `no-npm-sandbox.mjs` (reproduces the no-npm job in the new runner test), `family-registry` family directories, `run-data-audit-lane.mjs` marker convention and `harness-runs-rls-adversarial-audit.mjs` / `candidate-dwell-audit.mjs` as audit models, F50 and its helpers, `loop-manifest.mjs` and `loop-hops.d`, `closure-gate.mjs`.
- The audit imports `HARNESS_RUN_COLUMNS` from the exporter so the SELECT column list has one home; that import is also what gives the exporter a non-test importer (F25).

Decisions
- A row maps to a hop by family. Where one family serves several hops (downstream-chain, propagation, gate-a-rescan) the hop is the one whose producer family has a row with `github_run_id` equal to the row's `upstream_run_id`; a row that cannot be placed on exactly one hop is printed as UNMAPPED and never written (a hop is not claimed fired on a guess). One entry per hop, the earliest firing row, so regeneration does not churn the file.
- The F9 to F12 skip prints a SKIP line and passes. Residual: if the Fitness functions job ever ran without a working install it would also skip; that job runs `npm ci` first and fails on its own error, so the skip cannot hide there.

What is NOT done
- Item 3, closure gate registration of `layout-baseline-renewal.yml`: stopped, decision not settled by the brief. Measured: the NEVER-RUN allowlist is the only mechanism for a workflow with no harness family, and adding `workflow:layout-baseline-renewal.yml` makes the gate FAIL with "allowlist stale, target is within grace" (current train is 71, the workflow was introduced after the last `train/wave` commit so its introduced train is null and it can never be overdue). Reverted; closure-gate.mjs is unchanged.
- No fixture could prove the exporter against real `harness_runs` rows; the live run is the executor's.

Open items
- Item 3 needs a coordinator ruling on a mechanism (see report).
- UX compliance: no `.tsx` or `.css` touched.
