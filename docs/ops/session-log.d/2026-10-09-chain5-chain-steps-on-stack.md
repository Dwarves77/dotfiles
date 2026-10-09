# 2026-10-09, lane CHAIN-5 (chain5-chain-steps-on-stack): the chain steps run against a stack that serves the function, checks its own names and asserts its roles

## Accomplished

- `fsi-app/supabase/config.toml`: `[edge_runtime] enabled = true` (was false), with the reason in a comment. The file is shared with migration-proof.yml through the local-stack composite action, which copies only this file into the scratch stack directory.
- `.github/workflows/chain-proof.yml` (chain steps only; the dump and oracle apply steps are untouched, PROOF-7 owns them): a new step before "Start the local stack" copies `fsi-app/supabase/functions/capture-worker` into `$CHAIN_PROOF_STACK/supabase/functions/` so the stack serves `/functions/v1/capture-worker`; a new step after "Schema oracle gate" runs the role check through `run-lane-step.mjs`.
- `fsi-app/scripts/proof/steps/chain-steps.json`: fetch-drain gains `post-reached-function-host` (queued_selected >= 1, invocations >= 1, no outcome key beginning `http_call_failed`, read from the step's own harness row); preconditions gains `no-prior-apply-run` (brief_apply_runs empty on the fresh stack); brief-apply gains `io-preflight-passed` (a finished apply-mode brief_apply_runs row started during the step) and `io-preflight-not-refused` (no brief-apply harness row stopped as `preflight_refused`). The two stale caveats are rewritten.
- `fsi-app/scripts/proof/steps/assertions.mjs` and `run-chain-steps.mjs`: `verifySchemaNames` runs before the first step. It reads every table an assertion names from the stack's `information_schema.columns` and plans every statement the manifest will send (assertion counts, minSql, var queries, setup, snapshots, the runner's automatic assertions) with `EXPLAIN (COSTS OFF)` under placeholder template values. A missing table or column stops the run at `schema-names`, before any script, naming the step, the assertion and the columns the stack really has. The counts land in the report as `schema_names`.
- `fsi-app/scripts/proof/chain-role-check.mjs` (new, wired by the workflow step): reads the replay report's applied files, scans them for CREATE ROLE and CREATE USER (comments stripped), and asks `pg_roles` on the stack and on the oracle. A missing role on either cluster, an unreadable applied file, or a scan that finds no role at all is red.
- Tests: `chain-role-check.test.mjs` (new: scan, check, runner, workflow shape), and additions to `run-chain-steps.test.mjs`, `assertions.test.mjs`, `prepare.test.mjs`.

## Read and reused

- Read: CLAUDE.md, COMMON.md and the CHAIN-5 section of batch2.md, `chain-proof.yml`, `chain-steps.json`, `run-chain-steps.mjs`, `assertions.mjs`, `prepare.mjs`, `manifest.mjs`, `run-fetch-drain.mjs` (function URL, metrics keys), `io-preflight.mjs` and the preflight section of `apply-record-briefs.mjs`, migration 322 (brief_apply_runs), `run-lane-step.mjs`, `replay-migrations.mjs` (report shape), `apply-schema-dump.mjs` (assertOracleUrl), the local-stack composite action, the five `[WORK: CHAIN-5]` log lines.
- Reused: the manifest and its assertion kinds (no new kind), `autoAssertions`, `substitute` and `templateKeys`, `run-lane-step.mjs` (its step record feeds the emitter), `assertOracleUrl` and `assertLoopbackDbUrl`, `DEFAULT_MIGRATIONS_DIR`, the existing `--pin-ids-from` pin on the export step and `briefBatch`'s NO TARGET refusal.

## Decisions

- Function host: the stack itself serves the function (edge_runtime on, directory copied before start); the drain keeps using `NEXT_PUBLIC_SUPABASE_URL`, so the POST goes to the same Kong route shape production uses. No stub server.
- Brief apply target: `briefBatch` already throws NO TARGET, which fails the step; the guarantee that a target exists is the pin. The new tests prove the pin names a committed batch whose ids the hook accepts, and that without them the hook refuses.
- Schema names: the catalog is the authority, so a typed name list was not added; the manifest's own SQL is planned against the live stack.
- The role check is a separate script because it needs two connections (stack and oracle) and the chain runner holds one.

## Red then green

- Against the old config, workflow, manifest and runner, 7 new tests fail (edge_runtime, role-check step, schema check order, missing column stops the run, missing table stops the run, fetch-drain assertion, IO pre-flight assertions). With the change, 104 of 104 pass across the six touched test files. [CONFIRMED: `node --test` run twice, before and after]

## Facts about the proof I could not observe

- [HYPOTHESIS] `supabase start` serves a function directory that exists in the stack directory before start, behind Kong at `/functions/v1/<name>`, and capture-worker's Deno imports resolve on the runner. If wrong, `post-reached-function-host` is red with the drain's own HTTP error, which is the assertion working.
- [HYPOTHESIS] `EXPLAIN` accepts the `$1::uuid[]` parameter shape used by the setup and snapshot statements under the pg driver (the tests stub the database).
- [HYPOTHESIS] The metrics endpoint the IO pre-flight samples is absent on the local stack, so the pre-flight decides on the cooldown alone; the assertions hold either way.

## NOT done

- The next chain proof fire (the first observation of the served function, the schema-name check and the role check on a real stack) is the executor's step; the workflow is dispatch only. [NOT-WORK: build-mode hold, workflow dispatch is the executor's, CLAUDE.md rule 16]
- `scripts/harness-runs/chain-proof/family.json` `governing_files` does not list `scripts/proof/chain-role-check.mjs`, so an edit to it does not change the family's governing hash. The file is outside this lane's write set. [WORK: owed]
- enabling edge_runtime in the shared `config.toml` makes migration-proof.yml boot the edge runtime container too (with no function in its stack directory); the added start time was not measured. [NOT-WORK: fact, measured by the first migration-proof run after merge]
- The brief named `fsi-app/scripts/proof/chain-*.mjs` as write set; the chain step files live under `fsi-app/scripts/proof/steps/`, which I edited as the evident intent. [NOT-WORK: scope statement, disclosed here and in the report]

## Open items

- Two lanes share one git stash list: while I ran a `git stash push` and `pop` to show the red tests, lane dfix2's stash and mine were exchanged by the pop. I restored my changes from the dangling stash commit and re-stashed dfix2's brief-candidates change, then dropped that duplicate once I saw dfix2's worktree carried its own copy again (its stash commit is 41ad28613b1a89f75860d11b80a929046936df8f). [NOT-WORK: fact, no further action; lanes should not use git stash in worktrees]
