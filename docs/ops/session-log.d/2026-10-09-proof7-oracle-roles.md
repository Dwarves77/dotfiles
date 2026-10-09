## 2026-10-09, lane PROOF-7 (proof7-oracle-roles): production roles are exported and created on the oracle before the dump is applied

Defect: chain proof fire 6 (run 37894782168) built the oracle cluster, replayed 345 of 345, and the dump apply failed with exactly one error, `line 14063: role "reconciler" does not exist`. pg_dump's schema dump omits roles, so every production role a GRANT or OWNER statement names must exist on the oracle first.

### Accomplished

1. `fsi-app/scripts/proof/dump-roles.mjs` (new). Mode `export` (credentialed export step only; refuses CHAIN_PROOF_LOCAL=1): first production candidate that connects (reuses `candidateConnStrings` and `firstWorkingCandidate`), then `pg_dumpall --roles-only --no-role-passwords --no-comments`, binary = newest `/usr/lib/postgresql/*/bin/pg_dumpall` else PATH; output is refused if any statement carries a PASSWORD clause. Mode `filter` (oracle step): reads the oracle's role list from `pg_roles` at run time (no typed list), keeps only CREATE ROLE, ALTER ROLE and GRANT statements that name a role the oracle lacks; any statement it does not recognise, or any PASSWORD clause, is refused. URL held to `assertOracleUrl` (loopback, supabase_admin, database postgres, not the stack's port).
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

### Decisions

- Roles are filtered at the oracle step, not the export step: the export step holds production credentials and no local env, the oracle step holds the local env and no production credentials, so the oracle's role list can only be read where the oracle is reachable. The raw file stays under RUNNER_TEMP; only the filtered file is uploaded.
- pg_dumpall (brief) is used rather than the Supabase CLI's `--role-only`. [HYPOTHESIS, unverified, no runner was used] The runner's psql package may carry a pg_dumpall older than the production server (the local stack config is major_version 17, the apt client on ubuntu-latest is typically 16); pg_dumpall refuses a newer server. `pickPgDumpall` takes the newest installed major, and a mismatch is a red step with the redacted message `pg_dumpall failed (exit N): ...`, never a pass. Fire 7 shows which.
- [HYPOTHESIS, unverified] The line shapes pg_dumpall writes (one statement per line: CREATE ROLE, ALTER ROLE ... WITH/SET, GRANT ... [WITH ...] [GRANTED BY ...]) are those the filter accepts; anything else is refused by design and named by its first characters, so a shape mismatch is a red step, not a silent drop.

### NOT done

- `fsi-app/scripts/harness-runs/chain-proof/family.json` lists the proof scripts as governing files (it names `dump-production-schema.mjs` and `apply-schema-dump.mjs`) and does not list `dump-roles.mjs`; the file is outside this lane's write set. [WORK: owed]
- Not run locally per COMMON rule 9: the whole suite, the fitness runner, tsc; no container, no pg_dumpall binary and no production connection were used, so pg_dumpall's real output shape and version compatibility are unproven until chain proof fire 7. [NOT-WORK: build-mode hold, COMMON rules 5 and 9]
- Docs describing the oracle apply (runbook 64-chain-proof.md, ADR-045, FAMILY.md) do not mention the roles file; outside this lane's write set and already owned by DOCS-5. [WORK: DOCS-5]
