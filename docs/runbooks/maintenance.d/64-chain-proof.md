## 64. `chain-proof`

**New this runbook, lane PROOF-1, 2026-10-07.** Not a `maintenance.yml` step: a dispatch-only workflow,
`.github/workflows/chain-proof.yml` (job name "Chain proof"), that proves the data layer of the loop on a disposable
local Supabase stack. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`. Family:
`fsi-app/scripts/harness-runs/chain-proof/FAMILY.md`.

**Expected state: RED.** Production's migration names diverge from the repo's file names (352 applied rows in
`fsi-app/docs/inventories/applied-migrations.json` when this runbook was written; 365 at its 2026-10-08 sync). Many
ledger rows have no file of their own: a later master migration retroactively captured their DDL, or they were
data-only loads from a closed lane. The record of which file stands for which row is `APPLIED-MAP.json` (below),
produced by lane MIG-HIST-1. **The gate that lifts it** is this job going green with an empty schema diff. Nothing in
the proof is relaxed to get there: no tolerate list, no skip list, no continue-on-error. The stale NOT APPLIED header
text was owed to the same lane; its session log records the header-only edits (351 to 357 and 182 corrected, a status
line on 16 files).

**State at the 2026-10-08 docs pass (DOCS-3): RED at the replay step, for a different reason.** The map landed in
PR 1013 (MIG-HIST-1b, merge commit 8be0cc9c, 2026-10-08T09:54Z). Run 37752670307 (a35ced3c, before that PR) refused the
replay because the map was absent; run 37786107972 (b53b85cc, after it) failed at the replay step and at the export of
the local ledger that needs it ("no local ledger: the replay did not run") [CONFIRMED: `gh run view` on both runs]. The
MIG-CI session log (`docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md`, on master since PR 1019 merged, 2026-10-09) records the replay stopping and each stop ruled: 028 (policies moved to 029), 035 via `007_full_brief`
(reclassified, then its function block removed), 091 (function body repointed to `base_tier`) and 170 (the stack lacked
`supabase_migrations.schema_migrations`). Those repairs rode PR 1019, which merged 2026-10-09.

**State at 2026-10-10 (DOCS-5, from the PROOF-6 to PROOF-9 session logs and the run artifacts).** PR 1019 merged
(65b18aafc, 2026-10-09). The oracle is a second cluster since PROOF-6 (PR 1065). Fires, each [CONFIRMED] from the named
run: fire 5 (37876624407) replay 343 of 343, oracle apply failed on 2738 errors as the ordinary role; fire 6
(37894782168) replay 345 of 345, dump apply failed on exactly one error, `role "reconciler" does not exist`
(PROOF-7, PR 1070, creates production roles first); fire 7 (38020216226) the roles filter refused `RESET ALL;`, the
CLI's trailing line (PROOF-8, PR 1081, explicit session-statement grammar); fire 8 (38032421565) the oracle gate could
not read the replayed schema and printed no cause (PROOF-9, PR 1084: `readCatalog` returns the SQLSTATE and message, the
grants CASE is typed, and migration-proof.yml runs `schema-diff.mjs --catalog-only` on the replayed stack on every PR that
touches migrations or `fsi-app/scripts/proof`); fire 9 (38058989236) replay 347 of 347 (38 satisfied, 1 skipped, 0 map
errors), roles and dump applied with 0 errors on 122 public tables, and the schema oracle gate FAILED with 562
differing objects. Fire 9 is the first fire to compare the two schemas, so it is the first real drift finding:
tables 11 changed; columns 7 changed; constraints 6 only in production and 24 changed; indexes 5 only in the replay and
1 only in production; functions 23 changed; policies 7 only in production and 135 changed; grants 1 only in the replay,
102 only in production and 240 changed (counts by `replay-schema-diff.json`). The job stays RED at the gate; the drift
between the migration files and production is the work the gate exists to expose, and nothing in the proof is relaxed.

**The applied map schema**: APPLIED-MAP.json (`fsi-app/supabase/migrations/APPLIED-MAP.json`, produced by lane MIG-HIST-1) is an object keyed by
ledger version. Each value is `{ name, file, class, superseded_by?, note? }` where `file` is a path or null and
`class` is one of:

| class | what the replay does |
|---|---|
| `identical`, `comments-only`, `code-differs`, `recovered` | a file stands for the ledger row: APPLY that file, in the order of `docs/inventories/migrations.md` |
| `statements-null`, `apply-record-stub` | the ledger stored no SQL for the row (NULL statements, or only a provenance note): the file is the only text, so the replay applies it exactly as it does `identical`. Added by PR 1013 (`APPLY_CLASSES` in `scripts/proof/applied-map.mjs`); on the 2026-10-08 map these are 112 and 6 of the ledger rows; an invented class is still refused |
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
2. Starts the oracle cluster (`create-oracle-db.mjs`, PROOF-6): a SECOND Postgres container, `chain-proof-oracle`, run
   from the same database image the stack uses (read from `docker ps`, no tag typed) on `127.0.0.1:54399`, with the
   stack's own database password; the step waits until `pg_roles` holds the five roles the image creates (postgres,
   anon, authenticated, service_role, supabase_admin). It runs before the replay. It is not a database inside the
   stack: the earlier `oracle_check` database was applied as the ordinary `postgres` role and failed with 2738 fatal
   errors (run 37876624407).
3. Builds the proof schema by replaying the migration files onto the stack's database (`replay-migrations.mjs`): the
   ledger is `applied-migrations.json`, the file selection is `APPLIED-MAP.json` (classes below), the order is
   `docs/inventories/migrations.md`; any map error refuses the replay; the first psql error stops it (file, line,
   message and statement named).
4. Export step, the only step with production credentials: a schema-only dump of production
   (`dump-production-schema.mjs`, `supabase db dump`, Supabase-managed schemas excluded, no roles) to runner disk, then
   the production ROLES (`dump-roles.mjs export`, PROOF-7: `supabase db dump --role-only`, version-matched to the
   server; the CLI emits no password), then the data subset (lane PROOF-2). pg_dump's schema dump omits roles, so
   every role a GRANT or OWNER statement names has to be created on the oracle first.
5. Applies the roles file, then the dump, to the oracle cluster as `supabase_admin` with `ON_ERROR_STOP=1`
   (`apply-schema-dump.mjs --roles`; `dump-roles.mjs filter` first reads the oracle's own role list at run time and
   keeps only the statements for roles the image does not create, strips every PASSWORD clause and refuses any
   statement outside its grammar: CREATE/ALTER ROLE, GRANT, and session statements named by `isSessionStatement`, such
   as the trailing `RESET ALL;`, never `SET ROLE`). No role or ownership statement in the dump is rewritten or dropped.
   A "role does not exist" error is red and listed in `missing_roles`; a dump naming a role absent from the roles
   file fails the step, which is the standing attack. The filtered `oracle-roles.sql` (role names and attributes only)
   is uploaded with the artifact.
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

**Rulings and rules of 2026-10-08 (DOCS-3 record).**
- Map classes `statements-null` and `apply-record-stub` replay the file like `identical` (PR 1013, MIG-HIST-1b session log: "Added to the reader's apply classes (same semantics as identical: the file is the only text, replay it)").
- Outside-ledger ruling for the three duplicate-prefix files. Coordinator ruling 2026-10-08, recorded in the MIG-CI session log: `006_rls_multi_tenant`, `007_rls_community` and `007_full_brief` become class `outside-ledger` (live, no ledger row), not `duplicate-prefix`. Evidence cited there: replay run 37779804328, where `035_agent_integrity_flags.sql` depends on `intelligence_items.full_brief`, created only in `007_full_brief.sql`; the two siblings are ruled by the same shape. The `duplicate-prefix` class stays in the vocabulary with no member. [CONFIRMED: `APPLIED-MAP.json` on master at 204d919f still carries the three as `dup:` entries of class `duplicate-prefix`; the re-key to `outside:` entries is in the PR 1019 branch's map and takes effect when it merges.] Owed with it: each outside-ledger file proven live by the replay gets a ledger row in production (a repair INSERT) after the replay reaches the end.
- Ledger-order replay rule (coordinator ruling 2026-10-08, built in `orderByLedger` of `scripts/proof/applied-map.mjs` on the PR 1019 branch): files apply by ledger version ascending (numeric); an outside-ledger file applies right after the ledgered file that precedes it in the inventory (first when none does); a file claimed by two ledger versions runs once, at the earlier. The inventory is still read for the anchor and for drift reports. On master (204d919f) the replay still orders by the inventory. The MIG-CI log records the two orders differing at 140 of 325 ledgered positions, all from position 155 on.
- The sequence stops at 028 (with 029), 007_full_brief and 091 were repaired in the migration files, not by an ordering override in the map: no `apply_after` field exists, by coordinator ruling.
- The migration-proof PR job. `.github/workflows/migration-proof.yml` (check context `Migration proof (apply on a local stack)`) replays the applied set and then applies every migration production has not applied, on the same stack, before production sees a file; its runbook file is `68-migration-proof.md`. In flight: PR 1019, not merged at this entry, so neither the workflow nor that runbook file is on master yet. Numbering collision, recorded for the coordinator: step number 67 is already taken on master (204d919f plus PR 1026) by `67-backfill-market-series-entity.md`, so the PR 1019 file duplicates it unless renumbered. Why it exists is recorded as I-6 in the incident ledger of the [audit catalogue](../audit-catalogue.md).
