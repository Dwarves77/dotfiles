# 2026-10-08, lane PROOF-5b (proof5b-oracle-statements): each oracle database statement is its own transaction

## Diagnosis

- [CONFIRMED] chain-proof run 37748342640 on master (after PROOF-5, PR 1008): step 11 got past the superuser error and failed with "DROP DATABASE cannot run inside a transaction block". Source: the coordinator's report of the run; this lane has no network access and did not re-read the run log.
- Cause: `create-oracle-db.mjs` passed terminate, drop and create to psql as ONE `-c` string. psql runs a multi-statement `-c` string as a single implicit transaction, and DROP DATABASE and CREATE DATABASE cannot run in a transaction block.
- This also settles one item in the PROOF-5 session log: the superuser path works, so the `supabase_admin` role and password derivation was sufficient to get past `pg_terminate_backend` (as reported by the coordinator for run 37748342640; not re-read here).

## Accomplished

- `fsi-app/scripts/proof/create-oracle-db.mjs`: the SQL is now an exported frozen array `STATEMENTS` of three single statements (no trailing semicolons), passed as three separate `-c` arguments in one psql invocation, still with `-v ON_ERROR_STOP=1`. Each `-c` is its own transaction. The retry loop is unchanged; a retry after a partial success is safe because the drop is `if exists`. Header comment updated with the cause and run id.
- `fsi-app/scripts/proof/create-oracle-db.test.mjs`: the one test that read a single `-c` value now asserts three `-c` arguments in order (terminate, drop if exists, create template postgres), `ON_ERROR_STOP=1` as the `-v` value, each statement a single line with at most one semicolon (none carries a multi-statement script).

## Tests (red then green, `node --test`)

- Red against the unchanged source: create-oracle-db 9 pass, 1 fail (the new three-`-c` test).
- Green after the change: see the PR report (10 of 10).

## Read and reused

- Read in full: the PROOF-5 version of `create-oracle-db.mjs` and its test (this lane's own prior work, now on master), and the coordinator's message. Reused the existing injectable `spawn` and `sleep`; no new module.

## NOT done

- Not run against a live stack or real psql. [INFERRED] from psql's documented behaviour that separate `-c` options each run as their own command and therefore their own transaction (psql 9.6 and later); the next chain-proof run is the check.

## Open items

- None blocking.
