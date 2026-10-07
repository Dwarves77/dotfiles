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

## Decision (coordinator ruling R1, 2026-10-07)

1. The L20 proof is the pair: the three dry fires prove the trigger layer; a dispatch-only workflow,
   `.github/workflows/chain-proof.yml`, proves the data layer on a disposable local Supabase stack started on the
   runner (free on a public repository). Together they satisfy L20's acceptance text (zero production writes, the
   full hop sequence recorded in `harness_runs`).
2. The copy is production's own schema, not the migration files (coordinator ruling, 2026-10-07). The local stack
   boots empty; the export step takes a schema-only dump of production with `supabase db dump` (schema only,
   Supabase-managed schemas excluded by the CLI, no roles) to runner disk, and `apply-schema-dump.mjs` applies it
   to the stack. That is the proof schema. A production data subset is exported read only and loaded locally by later
   lanes (PROOF-2); the chain steps and attack suite follow (PROOF-3, PROOF-4).
3. The migration files are history that does not currently reproduce production: the committed applied-migrations
   inventory (production `list_migrations`, 352 rows; the executor's earlier figure of 239 was wrong) has 46 rows
   with no file (production recorded many migrations under names that differ from the file names, and 22 are
   `216_` to `237_` coverage-gap rows whose files are absent) and 17 files with no applied row. The file replay is
   therefore DISCOVERY, never a gate: it runs after the data proof, in continue-on-error mode, against a second empty
   database (`replay_check`) on the same stack, and reports applied, skipped-unmatched and errors, plus a normalised
   schema diff (counts and names of differing tables, columns, functions, triggers and constraints, never row data)
   against the proof schema. The name-to-file mapping and the 46 missing files are owed findings for a docs and
   migrations lane.
4. Isolation (ruling R2 and R3 as amended): `scripts/lib/pg-conn.mjs` has a loopback mode (`CHAIN_PROOF_LOCAL=1`, or a
   loopback first URL) that connects without TLS to loopback only and never falls through to a production host.
   The export step reads three existing repository secrets (`NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`) and is the only step with them in its env; every other step
   sources the local env file and runs `scripts/proof/preflight.mjs`, which fails the job on a production host or on
   `SUPABASE_DB_PASSWORD`, `APP_URL`, `WORKER_SECRET`, a GitHub token or any other forbidden name. `permissions` is
   `contents: read`. The repository is public: the run artifact is counts, migration file names and hashed ids, never
   a row.
5. The job holds no production write credential, so its run artifact is uploaded as a workflow artifact and is not
   landed into production `harness_runs`.

## Consequences

- The `workflow_run` delivery itself stays covered by F50, F60, F61 and the dry fires, not by this job.
- L20's wording about a Supabase branch is retired; the plan text is not edited (coordinator file).
- A migration that cannot replay on an empty database is a finding recorded by the discovery replay, not patched by the
  proof's lane, and it does not stop the proof.
- The applied-migrations inventory (`fsi-app/docs/inventories/applied-migrations.json`) stays as the matching source
  for the discovery replay; its refresh is a hand step (`scripts/proof/sync-applied-migrations.mjs`).
