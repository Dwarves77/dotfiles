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
   of `docs/inventories/migrations.md` (the Supabase CLI cannot: duplicate numeric prefixes at 006 and 007), filtered
   by the committed applied-migrations inventory (`fsi-app/docs/inventories/applied-migrations.json`, production
   `list_migrations`, 352 rows; an earlier figure of 239 was wrong). It stops on its first error. There is no
   tolerate list, no skip list and no continue-on-error mode. An applied row with no file is an error and the
   replay refuses to run.
3. A schema-only dump of production is the ORACLE, not the copy. The credentialed export step writes it to runner
   disk (`supabase db dump`, schema only, Supabase-managed schemas excluded, no roles); it is applied to a second
   database on the stack (`oracle_check`); and `scripts/proof/schema-diff.mjs` compares the replayed schema with it
   (tables, columns, types, defaults, constraints, indexes, functions, triggers, policies; names and definition
   hashes, never rows). The difference must be empty, or the job fails at that step with the counts and the names of
   the differing objects in the log and the artifact. A production data subset is then exported read only and
   loaded locally by later lanes (PROOF-2); the chain steps and attack suite follow (PROOF-3, PROOF-4).
4. Expected state: the job is RED today. Production's migration names diverge from the file names: 46 applied rows
   have no file (22 are `216_` to `237_` coverage-gap rows) and 17 files have no applied row, so the replay refuses
   and the oracle diff would not be empty. The repair is owed to a migrations-history lane: recover the 46 missing
   files verbatim from production's `schema_migrations.statements` and reconcile the 17 unmatched files (and fix the
   stale NOT APPLIED header text). The gate that lifts the red state is the job itself going green with an empty
   schema diff. Nothing in the proof is relaxed to turn it green.
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
