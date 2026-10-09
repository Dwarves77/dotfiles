# 2026-10-08, lane PROOF-5 (proof5-oracle-superuser): the oracle database is created as the stack's superuser

## Diagnosis

- [CONFIRMED] chain-proof run 37743372083 on master dfb215db: step 11 "Create the empty oracle_check database" failed on all 5 attempts with "Only roles with the SUPERUSER attribute may terminate processes of roles with the SUPERUSER attribute". Steps 1 to 10 green. Step 19 (export of the local harness_runs ledger) then failed 42P01 because the replay never ran: a consequence, not a second defect. Source: the run log as given in the brief; this lane has no network access and did not re-read the run.
- Mechanism: `create-oracle-db.mjs` ran `pg_terminate_backend` over every session on `postgres` as the stack's `postgres` role, which is not a superuser. The sessions it cannot terminate belong to superuser roles of the stack's own services. Which roles hold sessions on `postgres` was NOT read from the stack's catalog: no container runtime exists in this environment (`docker` absent), so the stack was not started. The only evidence of role names is [INFERRED] from the Supabase CLI 2.95.4 binary installed here (grep of the executable): its service environments contain `DB_USER=supabase_admin`.
- Fix choice: the one step that needs a superuser runs as the stack's superuser on loopback; nothing else changes. [INFERRED] `supabase_admin` is that role and its password equals the DB password printed in `DB_URL` (the CLI configures its services with one configured database password; not run against a live stack). The first chain-proof run after this change is the check; if the password differs the step fails by name on authentication and the fix is to the derivation in `write-local-env.mjs` only.

## Accomplished

- `fsi-app/scripts/proof/write-local-env.mjs`: writes `PROOF_DB_SUPERUSER_URL` (the loopback `DB_URL` with the user replaced by `supabase_admin`, password kept) through new exported `withUser` and `SUPERUSER_ROLE`.
- `fsi-app/scripts/proof/preflight.mjs`: `PROOF_DB_SUPERUSER_URL` added to URL_VARS, loopback-asserted like the other connection variables; optional (steps before the env carries it still pass).
- `fsi-app/scripts/proof/create-oracle-db.mjs`: the terminate, drop, create block connects with `PROOF_DB_SUPERUSER_URL` (parameter renamed `superuserUrl`); `PROOF_ORACLE_DB_URL` is still built from the ordinary `PROOF_DB_URL` role. New pure `resolveInputs` returns an error naming the variable (exit 2) for an absent or non-loopback variable. Header hypothesis replaced with the confirmed finding and the run id.
- `fsi-app/scripts/proof/export-local-harness-runs.mjs`: a 42P01 on the ledger read becomes `NoLocalLedgerError`; the CLI body is now `runCli` with injected deps and exits 2 with "no local ledger: the replay did not run". The read is still exactly one SELECT; the client is still closed.
- `.github/workflows/chain-proof.yml`: UNCHANGED. [CONFIRMED by reading it] step 11 runs `. "$CHAIN_PROOF_ENV"` before `create-oracle-db.mjs`, so the new variable is picked up from the env file; `chain-proof-workflow.test.mjs` passes (12 of 12).

## Tests (red then green, `node --test`)

- Red, run against the old sources with the new tests in place: `write-local-env.test.mjs`, `create-oracle-db.test.mjs`, `export-local-harness-runs.test.mjs` failed to load (the new exports `withUser`, `SUPERUSER_ROLE`, `resolveInputs`, `runCli`, `NoLocalLedgerError` did not exist); `preflight.test.mjs` 30 pass, 2 fail (the two superuser-URL attack cases).
- Green: write-local-env 11 of 11, preflight 32 of 32, create-oracle-db 10 of 10, export-local-harness-runs 11 of 11, chain-proof-workflow 12 of 12.
- The attack cases: a superuser URL on a production host and on a non-loopback non-production host are refused by preflight (password never echoed); a non-loopback superuser URL is refused by `resolveInputs` and by `createOracleDb` before psql is called; the CLI exits 2 naming `PROOF_DB_SUPERUSER_URL` when it is absent (spawned child).

## Read and reused

- Read in full: CLAUDE.md, `docs/dispatches/lane-common-contract.md`, the four scripts and their tests, `chain-proof.yml`. Reused: `isLoopbackHost` (`scripts/lib/pg-conn.mjs`), `assertLoopbackDbUrl` (`replay-migrations.mjs`), `withDatabase`, the injectable `spawn` and `sleep` of `createOracleDb`, the existing `exportLocalHarnessRuns` client contract, `isMainModule`. No new module.

## NOT done

- Not run against a live stack (no container runtime here, no network). The `supabase_admin` role name and its password equality are INFERRED, see Diagnosis. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- `replay-migrations.mjs`, `schema-diff.mjs`, `attacks/**`, the production dump step and the migrations are untouched. Whether later steps (the replay of migrations that create roles or extensions, as `postgres`) hit the same superuser limit is not known until the run reaches them. [CLOSED: PR 1072]

## Open items

- Observation, not changed: Node itself consumes any `--env-file <path>` argument anywhere on its command line (it exits 9 if the file is absent). `create-oracle-db.mjs --env-file "$CHAIN_PROOF_ENV"` therefore also makes node load the env file into that process. Harmless here (the step sources the same file first), and the new CLI test passes an existing empty file for this reason. [NOT-WORK: fact, no action]
