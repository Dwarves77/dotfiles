# 2026-10-08, lane MIG-CI (migci-apply-on-stack): a migration is proven by running it before production sees it

## Accomplished

- Start condition checked: PR 1013 (MIG-HIST-1b) merged 2026-10-08T09:54:15Z; the worktree was cut from origin/master 8be0cc9c afterwards.
- Lifted the generic stack steps out of `chain-proof.yml` into the composite action `.github/actions/local-stack/action.yml` (psql, Supabase CLI, empty stack from the scratch config, loopback env file, preflight; inputs `stack_dir` and `env_file`; no secret input). `chain-proof.yml` now calls it in place of five inline steps; its later steps still source the env file and preflight themselves. `chain-proof-workflow.test.mjs` was updated for the lift only (write-set expansion granted for that lift): the inline-stack test became two tests, one on chain-proof's use of the action, one on the action's content. 13 tests pass (12 before).
- New `fsi-app/scripts/proof/apply-pending-migrations.mjs` (write-set expansion granted by the coordinator): dry by default, `--apply` runs; loopback only; selects the map's `never-applied` entries plus unreferenced files, minus `299_item_type_required_slots_wave3.sql` by name; applies in numeric prefix order, one `runFileWithPsql` run per file; stops at the first failure and keeps the file, line, statement and full psql error text. On the committed tree its dry run selects 370, 371, 372 and excludes 299.
- New `.github/workflows/migration-proof.yml`: triggers on every pull_request to master (no path filter), decides inside the job whether the PR touched `fsi-app/supabase/migrations/**` from the merge commit's diff against its base parent, skips all stack steps when not, otherwise runs the stack, the replay, the apply, uploads `migration-proof-report`, stops the stack. Context string: `Migration proof (apply on a local stack)`.
- Tests: `apply-pending-migrations.test.mjs` (11), `migration-proof-workflow.test.mjs` (9).
- Runbook `docs/runbooks/maintenance.d/67-migration-proof.md`.

## Follow-up: F25 red on PR 1019 (coordinator-approved fix)

- CI run 37761862971, fitness job: F25 (module-liveness) failed, one violation: `write-local-env.mjs` had no production importer. Cause [CONFIRMED from the log and the F25 source]: F25 reads dispatch roots from `.github/workflows/*.yml` only (Source 1 and Source 11); the lift moved the only reference out of every workflow into `.github/actions/local-stack/action.yml`.
- Fix (granted): `F25-module-liveness.mjs` now scans `CI_RUN_SITE_GLOBS` = workflow files plus `.github/actions/**/*.yml` at both sites. No allowlist entry. Checked first: `execution-wiring.mjs` reads only discipline.yml's literal text (no action parsing); F52's `listWorkflowAndActionFiles` is a lister that reads the filesystem and is not injectable into F25's glob-based tests, so the one-site change is widening F25's own existing glob list.
- Tests: 3 added to `F25-module-liveness.test.mjs` (a composite-action run line is a root, including through a nested .sh; the globs reach the real action file; on the real tree `write-local-env.mjs` is a root). Red then green: with the glob list narrowed back to workflows only, exactly those 3 fail (53 pass, 3 fail); restored, 56 of 56 pass.

## Read and reused

- Read in full: CLAUDE.md, `docs/dispatches/lane-common-contract.md`, `chain-proof.yml`, `chain-proof-workflow.test.mjs`, `replay-migrations.mjs`, `applied-map.mjs`, `APPLIED-MAP.json` (never and outside entries), `64-chain-proof.md`, `build-proof.yml`, the `discipline.yml` header and docs-only step, `.github/actions/maintenance-step/action.yml`, ADR-046, the header of migration 299, `write-local-env.mjs` and `preflight.mjs` headers.
- Reused: `planReplay`, `parseInventoryOrder`, `runFileWithPsql`, `parsePsqlOutput`, `assertLoopbackDbUrl` and the `DEFAULT_*` paths from `replay-migrations.mjs`; `parseAppliedInventory` from `sync-applied-migrations.mjs`; `isMainModule`; `FORBIDDEN_NAMES` from `preflight.mjs`; chain-proof's stack steps (moved, not copied); the workflow-test form of `chain-proof-workflow.test.mjs`. Nothing second-copied: the selection is `planReplay`'s own output, so the replay and the apply cannot disagree about which file is which.

## Decisions

- Required check without a path filter (coordinator accepted): a path-filtered workflow that does not fire never reports, and a required check that never reports blocks the merge. The job always runs and decides inside.
- The diff uses the pull_request merge commit (`HEAD^1` is the base tip) with `fetch-depth: 2`, so no history fetch or API token is needed; absent a merge parent it fails toward running the proof.
- File headers are not the selector (several say NOT APPLIED for applied files); the map plus unreferenced files is.
- A defect in any pending migration fails every migration PR until it reaches production, by design (recorded in the runbook).
- No `npm ci` in the new job: the replay, preflight and apply scripts import only Node built-ins and relative modules.

## Red then green

- `apply-pending-migrations.mjs` is new, so there is no old code to fail against; each behaviour was shown red by mutating the script and green again on restore: removing the 299 exclusion failed 2 tests; removing the stop at the first failure failed the negative-fixture test; sorting lexically instead of numerically failed the selection test; running in dry mode failed 2 tests. Restored script is byte-identical to the baseline; 11 of 11 pass.
- `migration-proof-workflow.test.mjs`: adding a path filter, adding a secret reference, removing `pipefail` from the apply step, and removing the touched gate from the replay step each failed exactly one test; restored, 9 of 9 pass.

## NOT done

- The stack path has not run anywhere. This machine has no docker and no psql, so the negative fixture is proven with an injected stand-in for psql that answers with the error text a real Postgres prints for a CHECK violation; the real psql and stack path is first exercised by CI on the first migration PR.
- [HYPOTHESIS] The applied-set replay is green on the stack today; chain-proof was "expected RED" when written and no run of the replay against the merged map has been seen by this lane. If it is red, every migration PR fails at the replay step, which is the proof working on a real defect.
- Branch protection is not edited (repository setting): the coordinator adds `Migration proof (apply on a local stack)`.
- `docs/INDEX.md` and the maintenance runbook index are not edited (coordinator).

## Open items

- Measured job runtime: see the PR report.
