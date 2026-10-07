## 64. `chain-proof`

**New this runbook, lane PROOF-1, 2026-10-07.** Not a `maintenance.yml` step: a dispatch-only workflow,
`.github/workflows/chain-proof.yml` (job name "Chain proof"), that proves the data layer of the loop on a disposable
local Supabase stack. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`. Family:
`fsi-app/scripts/harness-runs/chain-proof/FAMILY.md`.

**What a firing does**:
1. Starts a local stack on the runner (storage and auth only, from `fsi-app/supabase/config.toml` copied into a
   scratch directory so the CLI never applies the migration tree).
2. Creates an empty `replay_check` database from the stack's own empty `postgres` database (`create-replay-db.mjs`),
   before any application schema exists.
3. Export step, the only step with production credentials: a schema-only dump of production
   (`dump-production-schema.mjs`, `supabase db dump`, Supabase-managed schemas excluded, no roles) to runner disk, then
   the data subset (lane PROOF-2).
4. Applies the dump to the stack (`apply-schema-dump.mjs`): that is the proof schema. Ownership statements are
   dropped; a "role does not exist" error is counted, not fatal; any other error fails the step.
5. Loads the subset, runs the chain steps and the attack suite through `run-lane-step.mjs` (a step whose script has not
   landed is recorded as skipped with the owning lane, never as a pass).
6. Discovery, never a gate, in continue-on-error mode: replays the migration FILES onto `replay_check`
   (`replay-migrations.mjs`) and compares that schema with the proof schema (`schema-diff.mjs`, counts and names of
   differing tables, columns, functions, triggers and constraints, never row data).
7. Uploads the `chain-proof-report` artifact (7 days) and writes one run artifact of the `chain-proof` family.

**Secrets**: the export step reads the existing repository secrets `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` (the data read) and `SUPABASE_DB_PASSWORD` (the schema dump), and nothing else. No
`APP_URL`, `WORKER_SECRET` or GitHub token is ever referenced; `permissions` is `contents: read`. Every other step
sources the local env file and runs `scripts/proof/preflight.mjs`, which fails on a production host or any forbidden
credential name, `SUPABASE_DB_PASSWORD` included. Nothing prints a connection string or a password; the dump and the
subset live under `RUNNER_TEMP` and are deleted at the end.

**Not landed into production**: the job has no production write credential. A production `harness_runs` row for a
green run is a separate hand step.

**Dispatch** (exact line):
`gh workflow run chain-proof.yml`

**Applied-migrations inventory (hand step, coordinator ruling 2026-10-07)**: the discovery replay matches migration
files against the committed `fsi-app/docs/inventories/applied-migrations.json` (production `list_migrations`, 352
rows at the first sync). To refresh it, the coordinator's executor exports the Supabase MCP `list_migrations` result
as JSON (an array of `{ version, name }`) and runs
`node fsi-app/scripts/proof/sync-applied-migrations.mjs <export.json>`, then commits the output. A migration file with
no applied row is SKIPPED and listed (`skipped_not_applied`); an applied row that matches no file is listed
(`applied_without_file`). Both are findings in the report, never errors that stop the replay. Order comes from
`docs/inventories/migrations.md`.

**Owed**:
- Docs and migrations lane: the name-to-file mapping (production recorded many migrations under names that differ from
  the file names), the 46 applied rows with no file (22 are `216_` to `237_` coverage-gap rows), the 17 files with no
  applied row, and the stale NOT APPLIED / NEVER APPLIED text in several migration headers (101, 149, 160, 272, 304,
  312, 321, 351 to 357), which is left alone by this lane.

**Reading a result**: the job summary lists the proof schema apply counts, the replay counts, the schema diff counts,
each skipped or failed step, and one defect per failed schema statement. `schema-apply-report.json` lists the failing
statements by line; `replay-report.json` has the per-file NOTICE lines (the migrations' own self-checks) and the
failing statement; `replay-schema-diff.json` has the differing names. A file that fails and should be tolerated or
skipped is a ruling recorded in `fsi-app/scripts/proof/replay-tolerate.json` (each entry needs a reason and an owner;
the file is absent until a ruling creates one).
