## 2026-10-10, lane PROOF-9 (proof9-oracle-gate-replayed-catalog): the oracle gate's catalog read names its own failure, and its one never-executed SQL construct is typed

Defect: chain proof fire 8 (run 38032421565, head 0a3c61fc2), step "Schema oracle gate": `schema-diff: could not read the replayed schema; the oracle gate cannot pass`. `readCatalog` returned a bare null and the cause was not printed.

### Findings

- [CONFIRMED: run 38032421565 log, the replay step] the replay probe read the stack's `PROOF_DB_URL` through psql (`public tables 122, committed catalog 108`) a few seconds before the gate, with the same URL and the same psql argument shape. The connection, the role and the CONNECT privilege on the stack are not the cause.
- [CONFIRMED: log, oracle apply step] the oracle side applied cleanly (roles applied, 122 tables, 0 errors), so the PROOF-6 retirement of `PROOF_DB_SUPERUSER_URL` is not the cause either: the gate step passes `$PROOF_DB_URL` and `$PROOF_ORACLE_DB_URL`, both written by `write-local-env.mjs`.
- [CONFIRMED: `git log` and `grep` of `.github`] `schema-diff.mjs` has never run against a real server in CI before fire 8: no earlier fire reached the gate, `migration-proof.yml` does not call it, and its test only used a fake `spawn`. `CATALOG_QUERY` therefore had no execution proof.
- [HYPOTHESIS, unverified] the cause is `acldefault(case when c.relkind = 'S' then 's' else 'r' end, c.relowner)` in the relation half of the grants read: a CASE of two untyped literals resolves to text, and `acldefault` takes a `"char"`; the function form `acldefault('f', p.proowner)` is already proven in migrations 371 and 375, this CASE form is the only one in the repo. This lane had no database to run the query on (brief rule 5), so the cause is not confirmed.
- [CONFIRMED: this lane's tests] the failure was invisible: `readCatalog` discarded stderr and the exit status, so a SQL error, a refused connection and a missing psql all looked the same.

### Accomplished

1. `fsi-app/scripts/proof/schema-diff.mjs`: `readCatalog` returns `{ catalog, error }`, never a bare null; `error` is `{ code, message }` from psql with the SQLSTATE (psql is now run with `-v VERBOSITY=verbose -v ON_ERROR_STOP=1`), redacted of the URL, the password and any postgres URL, capped at 500 characters. New pure helpers `redactPgText` and `describePsqlFailure`. The CLI reads both sides, prints each failing side with its code and message, then exits 1. The grants CASE now types both branches `::"char"`.
2. `fsi-app/scripts/proof/schema-diff.test.mjs`: eight new tests (success shape, connection error with redaction, wrong role code 42501, missing function code 42883, verbose and stop flags, launch failure / signal / unparseable output / silent exit, capped text, the acldefault typing guard, the CLI printing both causes with psql absent).

### Red then green (`node --test fsi-app/scripts/proof/schema-diff.test.mjs`)

| State | Result |
|---|---|
| New tests against the old module (before the edit) | 8 fail (the eight new tests), 11 pass |
| After the edit | 19 of 19 pass |

### Read and reused

Read: COMMON, root `CLAUDE.md`, `schema-diff.mjs` and its test, `pg-conn.mjs` (not the cause, not edited: the gate reads through psql, not through `connectPg`), `write-local-env.mjs`, `preflight.mjs`, `chain-proof.yml` (replay, oracle apply and gate steps), the run 38032421565 log for the gate, replay and oracle steps, the run's downloaded report files. Reused: the redaction pattern from `apply-schema-dump.mjs`, the injectable `spawn` convention, the existing `readCatalog` call sites (only the CLI). No new module.

### Decisions

- The workflow, `write-local-env.mjs`, `preflight.mjs` and `pg-conn.mjs` are unchanged: the env names and URLs the gate receives are correct.
- A bare password is redacted from error text only when it is at least 6 characters and not the username, host, database or the word postgres, so ordinary words in a pg message are not corrupted (a local stack's password is `postgres`).

### NOT done

- The acldefault typing is a [HYPOTHESIS] fix; whether it is the whole cause is proven only by the next chain proof fire, whose gate step now prints the SQLSTATE and message if it fails again. [WORK: owed]
- The catalog query has no test against a real Postgres in any lane that runs on every PR (only fixture tests); a gate that has never executed was the root of this defect class. [WORK: owed]
