## 2026-10-09, lane PROOF-7 (proof7-oracle-roles): production roles are exported and created on the oracle before the dump is applied

Defect: chain proof fire 6 (run 37894782168) built the oracle cluster, replayed 345 of 345, and the dump apply failed with exactly one error, `line 14063: role "reconciler" does not exist`. pg_dump's schema dump omits roles, so every production role a GRANT or OWNER statement names must exist on the oracle first.

### Accomplished

1. `fsi-app/scripts/proof/dump-roles.mjs` (new). Mode `export` (credentialed export step only; refuses CHAIN_PROOF_LOCAL=1): first production candidate that connects (reuses `candidateConnStrings` and `firstWorkingCandidate`), then `supabase db dump --db-url <candidate> --role-only -f <out>` (corrected in PROOF-7b: the first version ran a local pg_dumpall, which is not version-matched to the Postgres 17 server). Mode `filter` strips every PASSWORD clause and asserts none survives in its output. Mode `filter` (oracle step): reads the oracle's role list from `pg_roles` at run time (no typed list), keeps only CREATE ROLE, ALTER ROLE and GRANT statements that name a role the oracle lacks; any statement it does not recognise, or a PASSWORD clause the strip could not remove, is refused. URL held to `assertOracleUrl` (loopback, supabase_admin, database postgres, not the stack's port).
2. `fsi-app/scripts/proof/apply-schema-dump.mjs`: new `--roles <file>`; the roles file is applied first with the same `psqlArgs` (ON_ERROR_STOP=1), same supabase_admin URL assertions; an error there is red (`roles_errors`, errors tagged `phase: roles`) and the dump is NOT applied. Report gains `roles_applied` and `roles_errors`; existing fields unchanged. The `missing_roles` check is untouched and is the attack: a dump naming a role absent from the roles file is red and names the role.
3. `.github/workflows/chain-proof.yml` (dump and oracle apply steps only): the credentialed export step runs `dump-roles.mjs export` (via run-lane-step, record `step-dump-production-roles.json`) before the subset export, writing `production-roles.sql` beside the schema dump (deleted with `schema-dump` at teardown); the oracle apply step runs `dump-roles.mjs filter` into `$CP_OUT_DIR/oracle-roles.sql` (uploaded with the artifact: role names and attributes only) and passes it with `--roles`. The `create-oracle-db.mjs` change the brief listed was not needed: the readiness wait already covers the image's own roles and the filter reads the oracle at run time.
4. Tests: new `dump-roles.test.mjs` (13), six new tests in `apply-schema-dump.test.mjs`, five new tests in `chain-proof-workflow.test.mjs` (roles export exists, in the credentialed step only, precedes the apply, `--no-role-passwords` and `--roles-only` present, no typed role list, filter reads the oracle, `--roles` passed, each with mutation attacks). In the existing PROOF-6 attack test the apply-step mutation now targets the `apply-schema-dump.mjs` occurrence of `--db-url "$PROOF_ORACLE_DB_URL"` (the filter line also names it); `LOCAL_SCRIPTS` gained `dump-roles` so the preflight-first check covers the new step.

### Read and reused

Read: COMMON and the batch 2 PROOF-7 section, root `CLAUDE.md`, `chain-proof.yml` (whole), `apply-schema-dump.mjs` and test, `create-oracle-db.mjs`, `dump-production-schema.mjs`, `chain-proof-workflow.test.mjs` (oracle checkers), `run-lane-step.mjs` (head), `docs/ops/session-log.d/2026-10-09-proof6.md`, the local-stack composite action (psql install lines). Reused: `candidateConnStrings`, `firstWorkingCandidate`, `redact`, `assertOracleUrl`, `psqlArgs`, `collectErrors`, `missingRole`, `isMainModule`, `run-lane-step.mjs` unchanged, the workflow test's `codeOf`, `steps`, `caughtOracle` helpers.

### Red then green (`node --test <file>`)

| Files | Before the change | After |
|---|---|---|
| dump-roles.test.mjs | ERR_MODULE_NOT_FOUND (module absent) | 13 of 13 |
| apply-schema-dump.test.mjs | 5 of the 6 new tests fail (13 pass), the sixth already holds | 31 of 31 with dump-roles |
| chain-proof-workflow.test.mjs | 4 of the 5 new tests fail (workflow and script not yet edited), the fifth already holds | 32 of 32 |
| all `scripts/proof/*.test.mjs` | | 301 of 301, 0 fail |
| PROOF-7b: dump-roles.test.mjs | against the PROOF-7 module: import fails (no `roleDumpArgs` export), 0 of 14 run | 14 of 14 |
| PROOF-7b: chain-proof-workflow.test.mjs, apply-schema-dump.test.mjs | | 64 of 64 together with dump-roles |

### Decisions

- Roles are filtered at the oracle step, not the export step: the export step holds production credentials and no local env, the oracle step holds the local env and no production credentials, so the oracle's role list can only be read where the oracle is reachable. The raw file stays under RUNNER_TEMP; only the filtered file is uploaded.
- PROOF-7b (2026-10-09): the export runs through `supabase db dump --role-only`, the same version-matched CLI and the same helpers (`candidateConnStrings`, `firstWorkingCandidate`, `redact`) as the schema dump; `pickPgDumpall` and every pg_dumpall call are deleted. The filter strips `PASSWORD '...'` clauses (also ENCRYPTED and E'' forms), drops a statement the strip leaves empty, and throws if a clause survives, so a secret cannot reach the uploaded artifact whatever the CLI emits.
- [HYPOTHESIS, unverified] The line shapes pg_dumpall writes (one statement per line: CREATE ROLE, ALTER ROLE ... WITH/SET, GRANT ... [WITH ...] [GRANTED BY ...]) are those the filter accepts; anything else is refused by design and named by its first characters, so a shape mismatch is a red step, not a silent drop.

### NOT done

- `fsi-app/scripts/harness-runs/chain-proof/family.json` did not list `dump-roles.mjs` as a governing file; PROOF-7b added it and `scripts/proof/chain-role-check.mjs` (CHAIN-5, PR 1072). [CLOSED: PR 1070]
- Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc; no container, no pg_dumpall binary and no production connection were used, so the real output shape of `supabase db dump --role-only` is unproven until chain proof fire 7 [NOT-WORK: build-mode hold, COMMON rules 5 and 9]; the pg_dumpall version mismatch with the Postgres 17 server is closed: the export now runs through supabase db dump, which is version-matched.
- Docs describing the oracle apply (runbook 64-chain-proof.md, ADR-045, FAMILY.md) do not mention the roles file; outside this lane's write set and already owned by DOCS-5. [WORK: DOCS-5]
