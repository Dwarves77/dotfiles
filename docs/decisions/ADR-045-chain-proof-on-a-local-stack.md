---
id: ADR-045
title: The chain proof runs on a disposable local stack, not a Supabase branch
status: accepted
date: 2026-10-07
scope: Stage 9 item 1 (end to end chain proof), lane L20, workflow chain-proof.yml, scripts/proof/, scripts/lib/pg-conn.mjs
supersedes: the "Supabase MCP create_branch" mechanism worded in lane L20 of docs/plans/complete-build-plan-2026-10-01.md
related: ADR-040, ADR-044
---

# ADR-045: The chain proof runs on a disposable local stack, not a Supabase branch

## Context

Lane L20 (complete-build-plan-2026-10-01.md) says to prove the autonomous chain on a Supabase branch database
created with the MCP `create_branch` tool: dispatch the chained-apply workflow against it, read the branch's
`harness_runs`, delete the branch, show zero production writes. Branching is a paid feature, and everything in this
build is free (operator ruling). It also cannot work as worded: every chain workflow takes
`secrets.NEXT_PUBLIC_SUPABASE_URL` from the repository, so a dispatched hop always reaches production, and the
`workflow_run` edges are GitHub events that no database can host.

The chain has two halves. The trigger layer (workflow_run edges, the dispatch fallback, upstream and loop ids) was
proven by three dry fires on 2026-10-06 and 2026-10-07: 13 of 13 hops fire at run level, and every chained row
carries `upstream_run_id` and the root's `loop_run_id`. Root run ids: Source sweep 37584128291 (fire 1),
37608860332 (fire 2), 37613373980 (fire 3, 12 of 12 chained rows carry that loop id). Evidence is in the gitignored
scratch files `fsi-app/scripts/tmp/chain-fire-2026-10-06.md` and `chain-fire-2-2026-10-07.md`; the board line is
`docs/PROGRAM-BOARD.md`, "Chain dry fire (2026-10-07 ...)". The data layer (the same scripts in hop order, in apply
mode, against a real schema, with read-back assertions and the attack suite) has never run.

## Decision (coordinator ruling R1, 2026-10-07; the schema question reversed the same day: no workarounds)

1. The L20 proof is the pair: the three dry fires prove the trigger layer; a dispatch-only workflow,
   `.github/workflows/chain-proof.yml`, proves the data layer on a disposable local Supabase stack started on the
   runner (free on a public repository). Together they satisfy L20's acceptance text (zero production writes, the
   full hop sequence recorded in `harness_runs`).
2. The stack's schema is built by replaying the repo's migration files, not copied from production.
   `scripts/proof/replay-migrations.mjs` applies each file with psql onto the stack's empty database, in the order
   of `docs/inventories/migrations.md` (the Supabase CLI cannot: duplicate numeric prefixes at 006 and 007), selected
   by the committed ledger (`fsi-app/docs/inventories/applied-migrations.json`, production `list_migrations`, 352
   rows; an earlier figure of 239 was wrong) through `fsi-app/supabase/migrations/APPLIED-MAP.json` (lane MIG-HIST-1;
   schema below). It stops on its first error. There is no tolerate list, no skip list and no continue-on-error mode.
   An applied row with no file is NOT in itself an error (a later master migration retroactively captured the DDL of
   many ledger rows, and some rows were data-only loads from a closed lane); a ledger version with no map entry is.
3. A schema-only dump of production is the ORACLE, not the copy. The credentialed export step writes it to runner
   disk (`supabase db dump`, schema only, Supabase-managed schemas excluded, no roles in the schema dump; production
   roles are exported separately and created first, see the Addendum 2026-10-10); it is applied to a second
   Postgres cluster (a container beside the stack, amended 2026-10-09 by PROOF-6; originally a second database,
   `oracle_check`, in the stack); and `scripts/proof/schema-diff.mjs` compares the replayed schema with it
   (tables, columns, types, defaults, constraints, indexes, functions, triggers, policies; names and definition
   hashes, never rows). The difference must be empty, or the job fails at that step with the counts and the names of
   the differing objects in the log and the artifact. A production data subset is then exported read only and
   loaded locally by later lanes (PROOF-2); the chain steps and attack suite follow (PROOF-3, PROOF-4).
4. Expected state: the job is RED until lane MIG-HIST-1 lands the map. Production's migration names diverge from the
   file names; the map is the record of which file stands for which ledger row. While the map file is absent the
   replay refuses naming it, which is the honest state. The gate that lifts the red state is the job itself going
   green with an empty schema diff. Nothing in the proof is relaxed to turn it green. The stale NOT APPLIED header
   text is owed to the same lane.

   The map is an object keyed by ledger version; each value is `{ name, file, class, superseded_by?, note? }`, `file`
   a path or null:

   | class | replay behaviour |
   |---|---|
   | `identical`, `comments-only`, `code-differs`, `recovered` | apply the file, in inventory order |
   | `superseded-by`, `data-only`, `comment-only` | satisfied with no file; counted and listed |
   | `outside-ledger` | a live file with no ledger version: applied (by its file) |
   | `never-applied`, `duplicate-prefix` | skipped and listed (by its file) |

   The replay refuses when the map is absent, a ledger version has no entry, a class is unknown, an entry needing a
   file has none, a map entry's file is missing, a file is claimed both to apply and to skip, or a file to apply is
   not in `docs/inventories/migrations.md`.
5. Isolation (ruling R2 and R3 as amended): `scripts/lib/pg-conn.mjs` has a loopback mode (`CHAIN_PROOF_LOCAL=1`, or a
   loopback first URL) that connects without TLS to loopback only and never falls through to a production host.
   The export step reads three existing repository secrets (`NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`) and is the only step with them in its env; every other step
   sources the local env file and runs `scripts/proof/preflight.mjs`, which fails the job on a production host or on
   `SUPABASE_DB_PASSWORD`, `APP_URL`, `WORKER_SECRET`, a GitHub token or any other forbidden name. No GitHub
   Environment is used. `permissions` is `contents: read`. The repository is public: the run artifact is counts,
   names and hashed ids, never a row and never the dump.
6. The job holds no production write credential, so its run artifact is uploaded as a workflow artifact and is not
   landed into production `harness_runs`.

## Consequences

- The `workflow_run` delivery itself stays covered by F50, F60, F61 and the dry fires, not by this job.
- L20's wording about a Supabase branch is retired; the plan text is not edited (coordinator file).
- A migration that cannot replay on an empty database stops the replay and fails the job; the proof's lane does not
  patch migrations. The migrations-history repair is a separate lane (decision 4).
- The applied-migrations inventory stays as the replay's applied-set source; its refresh is a hand step
  (`scripts/proof/sync-applied-migrations.mjs`, which also owns the inventory's shape).

## Addendum 2026-10-08 (docs pass DOCS-3; amends decisions 2 and 4, rewrites nothing above)

Facts and rulings that landed after this ADR was written. The operating detail is in
[runbook 64](../runbooks/maintenance.d/64-chain-proof.md), which carries the same record.

1. The map exists. PR 1013 (MIG-HIST-1b, merge commit 8be0cc9c, 2026-10-08) landed `APPLIED-MAP.json` and the replay
   reader's classes. Decision 4's "RED until the map lands" is spent: the job is RED at the replay step instead
   (run 37786107972, b53b85cc). The ledger the map covers is 365 rows at the 2026-10-08 sync of
   `applied-migrations.json` (352 in decision 2 and above).
2. Two map classes beyond the table in decision 4: `statements-null` (the ledger stored no SQL for the row) and
   `apply-record-stub` (the ledger stored a provenance note, not SQL). Both replay the file exactly like `identical`,
   because the file is the only text. They are 112 and 6 rows of the 2026-10-08 map. An invented class is still
   refused.
3. Outside-ledger ruling. The three files the map carried as `duplicate-prefix` (`006_rls_multi_tenant`,
   `007_rls_community`, `007_full_brief`) are ruled class `outside-ledger` by the coordinator on 2026-10-08, on the
   evidence of replay run 37779804328 (`035_agent_integrity_flags.sql` depends on `intelligence_items.full_brief`,
   created only in `007_full_brief.sql`; the siblings by the same shape). Source: the MIG-CI session log
   (`docs/ops/session-log.d/2026-10-08-migci-apply-on-stack.md`, on master since PR 1019 merged, 2026-10-09) and PR 1013 for
   the map they are re-keyed in. The re-key took effect when PR 1019 merged (2026-10-09); master at 204d919f listed them as
   `duplicate-prefix`.
4. Replay order. Decision 2 says the order is `docs/inventories/migrations.md`. The coordinator ruled on 2026-10-08
   that the replay applies by ledger version ascending, an outside-ledger file right after the ledgered file that
   precedes it in the inventory, a doubly claimed file once at the earlier version (`orderByLedger`, PR 1019). The
   ledger order is on master since PR 1019 merged (2026-10-09).
5. The same stack now also proves pending migrations before production: the `migration-proof` pull_request job
   (`.github/workflows/migration-proof.yml`, runbook file `68-migration-proof.md`) replays the applied set and applies every migration
   production has not applied. PR 1019 merged 2026-10-09 (65b18aafc).

## Addendum 2026-10-10 (docs pass DOCS-5; PROOF-6 to PROOF-9 amend decision 3, rewrite nothing above)

Facts from the PROOF-6 to PROOF-9 session logs and the run artifacts; the operating detail is in
[runbook 64](../runbooks/maintenance.d/64-chain-proof.md).

1. The oracle is a second cluster (PROOF-6, PR 1065). A schema dump applied as the stack's ordinary role failed with
   2738 fatal errors (run 37876624407: extensions outside the `postgres` database, a schema it did not own). The oracle
   is now a second container from the stack's own database image on loopback port 54399, applied as `supabase_admin`
   with `ON_ERROR_STOP=1`. No role or ownership statement in the dump is rewritten, stripped or tolerated (coordinator
   ruling).
2. Roles come first (PROOF-7, PR 1070, and PROOF-7b). pg_dump's schema dump omits roles, so fire 6 (37894782168)
   failed on `role "reconciler" does not exist`. The credentialed export step also runs `supabase db dump --role-only`
   (version-matched; a local pg_dumpall was rejected for its version mismatch with the Postgres 17 server). The oracle
   step filters the roles file against the oracle's own role list read at run time (never a typed list), strips every
   PASSWORD clause, and applies it before the dump. `apply-schema-dump.mjs`'s `missing_roles` check remains the attack:
   a dump naming a role absent from the roles file is red.
3. The roles filter is a grammar (PROOF-8, PR 1081). The CLI ends its output with `RESET ALL;`; the first filter refused it
   (fire 7, 38020216226). `isSessionStatement` accepts `RESET`, `SET <guc>`, and `set_config` and refuses `SET ROLE` and
   `SET SESSION AUTHORIZATION`; every other statement is still refused.
4. The gate names its failures (PROOF-9, PR 1084). Fire 8 (38032421565) could not read the replayed schema and printed no
   cause. `readCatalog` now returns the SQLSTATE and message, redacted; the catalog read is also exercised on the
   replayed stack by the `migration-proof` PR job (`schema-diff.mjs --catalog-only`), so a broken catalog query fails a
   PR, not only a dispatch.
5. First drift finding [CONFIRMED: run 38058989236, `replay-schema-diff.json`]. Fire 9 replayed 347 of 347 migrations,
   applied roles and dump with 0 errors, and the schema oracle gate failed with 562 differing objects between the
   replayed schema and production: the largest groups are 135 changed and 7 production-only policies, 240 changed and
   102 production-only grants, 23 changed functions, 24 changed and 6 production-only constraints. Decision 3's gate
   did its job; resolving the drift is migration-history work, not a relaxation of the gate.
