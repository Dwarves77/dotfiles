# chain-proof family

Registered by lane PROOF-1, 2026-10-07. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`.

`.github/workflows/chain-proof.yml` (dispatch only, 60 minute limit, one at a time) starts a disposable local
Supabase stack on the runner and builds its schema by REPLAYING THE REPO'S MIGRATION FILES
(`scripts/proof/replay-migrations.mjs`: ledger `fsi-app/docs/inventories/applied-migrations.json`, file selection
`fsi-app/supabase/migrations/APPLIED-MAP.json` read by `applied-map.mjs`, order from `docs/inventories/migrations.md`,
stops on the first error, no tolerate list, no continue-on-error).
In the credentialed export step (the only step holding production credentials) a schema-only dump of production is
written to runner disk (`dump-production-schema.mjs`) and applied to a second database, `oracle_check`
(`create-oracle-db.mjs`, `apply-schema-dump.mjs`). `schema-diff.mjs` is the gate: the replayed schema and the dump
must be identical (tables, columns, types, defaults, constraints, indexes, functions, triggers, policies; names and
definition hashes, never rows) or the job fails with the counts and the names of the differing objects. Only then
do the subset load, the chain steps in hop order with read-back assertions, and the attack suite run. Each later step
is a script under `scripts/proof/`; `run-lane-step.mjs` runs it or records a named skip while its lane has not landed.

**Expected state: RED.** Production's migration names diverge from the repo's file names, and the record of which file
stands for which ledger row is `APPLIED-MAP.json` (lane MIG-HIST-1; schema in runbook 64 and ADR-045). Until it lands
the replay refuses because the map is absent. The gate that lifts it is this job going green with an empty schema diff.

Every step after the export runs with the local stack's environment only. `scripts/proof/preflight.mjs` asserts that
at the start of each step and fails the job on a production host or any forbidden credential name.
`scripts/lib/pg-conn.mjs` has a loopback mode (CHAIN_PROOF_LOCAL=1) that never falls through to a production host.

One firing leaves one run artifact written by `scripts/proof/emit-chain-proof-artifact.mjs`: replay counts, one
defect per failed migration file, per applied row with no file and per failed post check; the oracle apply counts;
the schema oracle result with one defect per category that differs (names of the differing objects); one entry per
later step (ran, skipped with the owning lane, or failed); and the number of local `harness_runs` rows. The repository
is public, so the artifact is counts, names and hashed ids only. It is uploaded as the `chain-proof-report` workflow
artifact (7 days). It is NOT landed into production `harness_runs`: the job holds no production write credential.

**Standing metrics**: `schema_diff_differing` (target 0, the gate), `replay_failed` (target 0), `replay_skipped`,
`schema_apply_fatal_errors` (target 0), `steps_failed` (target 0), `steps_skipped` (falls to 0 as the later lanes
land).

Dispatch: see `docs/runbooks/maintenance.d/64-chain-proof.md`.
