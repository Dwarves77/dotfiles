## 64. `chain-proof`

**New this runbook, lane PROOF-1, 2026-10-07.** Not a `maintenance.yml` step: a dispatch-only workflow,
`.github/workflows/chain-proof.yml` (job name "Chain proof"), that proves the data layer of the loop on a disposable
local Supabase stack. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`. Family:
`fsi-app/scripts/harness-runs/chain-proof/FAMILY.md`.

**What a firing does**: starts a local stack on the runner (storage and auth only, from `fsi-app/supabase/config.toml`
copied into a scratch directory so the CLI never applies the migration tree), replays every migration file onto the
empty database in the order of `docs/inventories/migrations.md` (`scripts/proof/replay-migrations.mjs`), then runs the
later steps through `scripts/proof/run-lane-step.mjs`: subset export (the only step with production read
credentials), subset load, chain steps, attack suite. A step whose script has not landed is recorded as skipped with
the owning lane, never as a pass. It uploads the `chain-proof-report` artifact (7 days) and writes one run artifact
of the `chain-proof` family.

**Secrets**: the export step reads the existing repository secrets `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` and nothing else. No `SUPABASE_DB_PASSWORD`, `APP_URL`, `WORKER_SECRET` or GitHub token
is ever referenced; `permissions` is `contents: read`. Every other step sources the local env file and runs
`scripts/proof/preflight.mjs`, which fails on a production host or any forbidden credential name.

**Not landed into production**: the job has no production write credential. A production `harness_runs` row for a
green run is a separate hand step.

**Dispatch**:
`gh workflow run chain-proof.yml`
First run in discovery mode (attempt every migration, record every failure instead of stopping at the first):
`gh workflow run chain-proof.yml -f replay_continue_on_error=true`

**Applied set (hand step, coordinator ruling 2026-10-07)**: the replay applies exactly what production has applied, from
the committed `fsi-app/docs/inventories/applied-migrations.json`, never from file headers. To refresh it, the
coordinator's executor exports the Supabase MCP `list_migrations` result as JSON (an array of `{ version, name }`) and
runs `node fsi-app/scripts/proof/sync-applied-migrations.mjs <export.json>`, then commits the output. A migration file
with no applied row is SKIPPED and listed (`skipped_not_applied`); an applied row that matches no file is an ERROR
(`applied_without_file`) and the replay refuses to run, naming the rows. Order still comes from
`docs/inventories/migrations.md`.

**Owed (docs lane)**: the NOT APPLIED / NEVER APPLIED text in several migration headers (101, 149, 160, 272, 304, 312,
321, 351 to 357) is stale for the applied ones and is left alone by this lane.

**Reading a result**: the job summary lists replay counts, each skipped or failed step, and one defect per migration
that did not replay (file, line, message). `replay-report.json` in the artifact has the per-file NOTICE lines (the
migrations' own self-checks) and the failing statement. Files skipped as not applied are in `skipped_not_applied`. A
file that fails but should be tolerated, or skipped for another reason, is a ruling recorded in
`fsi-app/scripts/proof/replay-tolerate.json` (each entry needs a reason and an owner; the file is absent until a
ruling creates one).
