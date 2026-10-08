## 64. `chain-proof`

**New this runbook, lane PROOF-1, 2026-10-07.** Not a `maintenance.yml` step: a dispatch-only workflow,
`.github/workflows/chain-proof.yml` (job name "Chain proof"), that proves the data layer of the loop on a disposable
local Supabase stack. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`. Family:
`fsi-app/scripts/harness-runs/chain-proof/FAMILY.md`.

**Expected state: RED.** Production's migration names diverge from the repo's file names (352 applied rows in
`fsi-app/docs/inventories/applied-migrations.json`). Many ledger rows have no file of their own: a later master
migration retroactively captured their DDL, or they were data-only loads from a closed lane. The record of which file
stands for which row is `APPLIED-MAP.json` (below), produced by lane MIG-HIST-1. Until it lands the replay refuses
because the map is absent, which is the honest state. **The gate that lifts it** is this job going green with an
empty schema diff. Nothing in the proof is relaxed to get there: no tolerate list, no skip list, no continue-on-error.
The stale NOT APPLIED header text (101, 149, 160, 272, 304, 312, 321, 351 to 357) is owed to the same lane.

**The applied map schema**: APPLIED-MAP.json (`fsi-app/supabase/migrations/APPLIED-MAP.json`, produced by lane MIG-HIST-1) is an object keyed by
ledger version. Each value is `{ name, file, class, superseded_by?, note? }` where `file` is a path or null and
`class` is one of:

| class | what the replay does |
|---|---|
| `identical`, `comments-only`, `code-differs`, `recovered` | a file stands for the ledger row: APPLY that file, in the order of `docs/inventories/migrations.md` |
| `superseded-by`, `data-only`, `comment-only` | the row is SATISFIED with no file of its own (a later master migration captured its DDL, or it was a data or comment load): counted and listed |
| `outside-ledger` | a file that is live but has no ledger version: APPLIED (handled by its file, whatever its key) |
| `never-applied`, `duplicate-prefix` | a file production never applied: SKIPPED and listed (handled by its file) |

The replay REFUSES (applies nothing, names every error) when: the map file is absent (red until MIG-HIST-1 lands, the
honest state); a ledger version in `applied-migrations.json` has no entry; a class is unknown; an entry that needs a
file has none; a map entry's file (or `superseded_by` file) is missing on disk; a file is claimed both to apply and to
skip; or a file to apply is not listed in `docs/inventories/migrations.md` (its order is unknown). A file on disk that
no entry references is listed as unreferenced, not an error.

**What a firing does**:
1. Starts a local stack on the runner (storage and auth only, from `fsi-app/supabase/config.toml` copied into a
   scratch directory so the CLI never applies the migration tree).
2. Creates an empty `oracle_check` database from the stack's own empty `postgres` database (`create-oracle-db.mjs`),
   before any application schema exists.
3. Builds the proof schema by replaying the migration files onto the stack's database (`replay-migrations.mjs`): the
   ledger is `applied-migrations.json`, the file selection is `APPLIED-MAP.json` (classes below), the order is
   `docs/inventories/migrations.md`; any map error refuses the replay; the first psql error stops it (file, line,
   message and statement named).
4. Export step, the only step with production credentials: a schema-only dump of production
   (`dump-production-schema.mjs`, `supabase db dump`, Supabase-managed schemas excluded, no roles) to runner disk, then
   the data subset (lane PROOF-2).
5. Applies the dump to `oracle_check` (`apply-schema-dump.mjs`; ownership statements dropped; a "role does not exist"
   error is counted, not fatal; any other error fails the step).
6. The schema oracle gate (`schema-diff.mjs`): the replayed schema and the dump must be identical across tables,
   columns (types, nullability, defaults), constraints, indexes, functions, triggers and policies. Otherwise the job
   fails with the counts and the names of the differing objects (never definitions, never rows).
7. Loads the subset, runs the chain steps and the attack suite through `run-lane-step.mjs` (a step whose script has
   not landed is recorded as skipped with the owning lane, never as a pass).
8. Uploads the `chain-proof-report` artifact (7 days) and writes one run artifact of the `chain-proof` family.

**Secrets**: the export step reads the existing repository secrets `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (the data read) and `SUPABASE_DB_PASSWORD` (the schema dump), and nothing else. No GitHub
Environment, no `APP_URL`, `WORKER_SECRET` or GitHub token is ever referenced; `permissions` is `contents: read`.
Every other step sources the local env file and runs `scripts/proof/preflight.mjs`, which fails on a production host
or any forbidden credential name, `SUPABASE_DB_PASSWORD` included. Nothing prints a connection string or a password;
the dump and the subset live under `RUNNER_TEMP` and are deleted at the end.

**Not landed into production**: the job has no production write credential. A production `harness_runs` row for a
green run is a separate hand step.

**Dispatch** (exact line): `gh workflow run chain-proof.yml`

**Applied-migrations inventory (hand step)**: the replay matches migration files against the committed
`fsi-app/docs/inventories/applied-migrations.json`. To refresh it, the coordinator's executor exports the Supabase MCP
`list_migrations` result as JSON (an array of `{ version, name }`) and runs
`node fsi-app/scripts/proof/sync-applied-migrations.mjs <export.json>`, then commits the output.

**Reading a failure**: the job summary lists the replay counts, the oracle apply counts, the schema oracle result per
category, each skipped or failed step, and one defect per failed file, unmatched applied row, failed schema statement
and differing category. `replay-report.json` has the per-file NOTICE lines (the migrations' own self-checks) and the
failing statement; `replay-schema-diff.json` has the differing names per category.
