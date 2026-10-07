## 2026-10-07, lane proof1-stack-and-replay: chain-proof job skeleton, migration replay, loopback database access

Stage 9 item 1, redesigned for a free runtime (ADR-045). Facts below were run or read in this lane. No database, network or workflow dispatch was used; nothing was fired.

### Accomplished
- `.github/workflows/chain-proof.yml`: dispatch only, `permissions: contents: read`, concurrency group of one, 60 minute limit, no GitHub Environment (coordinator amendment to R3). Steps: checkout, node, `npm ci`, psql check, Supabase CLI, local stack start from a scratch directory holding only `config.toml` (so the CLI never applies the migration tree), local env file, preflight, migration replay, subset export (the only step with the two existing repository secrets), subset load, chain steps and attack suite (each through `run-lane-step.mjs`, a named skip while the lane is absent), local `harness_runs` export, run artifact, upload (7 days), stack stop and subset delete.
- `fsi-app/supabase/config.toml`: minimal stack (storage and auth on; studio, realtime, analytics, edge runtime, inbucket, pooler, image transformation off; seed off). Postgres major version 17 is a HYPOTHESIS.
- `scripts/lib/pg-conn.mjs`: loopback mode (R2). `CHAIN_PROOF_LOCAL=1`, or a loopback first explicit URL, gives a candidate list of loopback URLs only and no TLS; never a derived production candidate. `pg` is now loaded inside `connectPg()`, so the pure helpers are importable without npm. New exports `isLoopbackHost`, `inLoopbackMode`, `connectOptionsFor`; `connectPg` takes optional `{ env, createClient }`.
- `scripts/proof/`: `replay-migrations.mjs` (inventory order, applied-set filter, psql per file in a transaction, per-file seconds and NOTICE lines, stop on first error with file, line, message and statement, optional tolerate and skip list needing reason and owner, discovery mode, post-replay checks), `preflight.mjs` (R3 isolation), `write-local-env.mjs`, `run-lane-step.mjs`, `export-local-harness-runs.mjs` (hashed ids), `emit-chain-proof-artifact.mjs`.
- Harness family `chain-proof` (family.json, FAMILY.md, pending marker) and the meta-harness pending marker; runbook `docs/runbooks/maintenance.d/64-chain-proof.md`; ADR-045 (supersedes L20's `create_branch` wording); closure-gate `HARNESS_FAMILY_BY_WORKFLOW` entry; `secrets-registry.mjs` and `secrets-topology.md` list `chain-proof.yml` as a consumer of the two existing names (no new name, no environment).

### Read and reused
Read: COMMON.md, proof1.md, CLAUDE.md, lane-common-contract, the chain-proof design file, pg-conn.mjs and its npmtest, data-audit-lane.yml, live-smoke.yml, secrets-registry.mjs, secrets-topology.md, migrations inventory and its generator, migrations 052, 256, 201, 331 headers, ADR-009, ADR-044, run-artifact.mjs, loop-run-id.mjs, family-registry, CONVENTION.md, emit-live-smoke-artifact.mjs and test, closure-gate.mjs, F25, F52, F68 headers, run-test-suite.sh, is-main.mjs, export-harness-ledger.mjs. Reused: `buildRunArtifactEnvelope`, `writeRunArtifact`, `resolveHarnessRunContext`, `isMainModule`, the family-descriptor registration, the live-smoke emitter shape, the inventory as the migration order source, `db-catalog.json` table count, `connectPg`.

### Confirmed facts about the tree
- The migrations inventory lists 323 rows, the directory has 323 `.sql` files, none unlisted or absent. Duplicate prefixes: 006 x2, 007 x3. Absent numbers: 37. The inventory is generated from the files in filename order, so its order for 006 and 007 equals lexical order; it is not independent evidence of production application order.
- Superseded by coordinator ruling 3: the applied set comes from the committed `fsi-app/docs/inventories/applied-migrations.json` (production `list_migrations`, 352 rows in the scratch export, not the 239 the ruling quoted; 174 short versions, 178 timestamp versions), synced by `scripts/proof/sync-applied-migrations.mjs`. Headers saying NOT APPLIED (101, 149, 160, 272, 304, 312, 321, 351 to 357) are stale for the applied ones; left alone, owed to a docs lane.
- Matching the applied rows to files (`appliedRowMatchesFile`): (version, name) = (prefix, rest), or name = whole base name, or timestamp-versioned row with name = rest. Against the real tree: 17 files match no applied row (SKIPPED, listed: 006_rls_multi_tenant, 007_full_brief, 007_rls_community, 182, 202, 205, 206, 207, 225, 248, 260, 262, 263, 270, 299, 315, 317) and 46 applied rows match no file (ERROR, the replay refuses). The 46 are mostly production rows recorded under a different name than the file (for example `gate_a_criterion_7` for `225_gate_a_criterion7`, `182 repoint_user_profiles_policy_arms` for `182_repoint_policies_off_user_profiles`, and 216 to 237 coverage-gap rows whose files are absent from the tree). So the replay as ruled refuses on the first dispatch until a name mapping or a ruling on those rows exists.
- Trigger names are `guard_pause_flag_writer_trg` (migration 201) and `guard_judgement_drain_writer_trg` (migration 354); the design file's names lack the `_trg` suffix. The post-replay check uses the real names.

### Decisions (not settled by the brief)
- The local stack starts from a scratch directory with a copy of `config.toml`, not from `fsi-app/`, because `supabase start` applies the migrations directory (design file step 2). A comment in config.toml says not to run the CLI from `fsi-app/`.
- `isLoopbackHost` lives in `pg-conn.mjs` (made npm-free) rather than a new lib file, to stay inside the write set and keep one definition.
- Post-replay table count is recorded against the committed catalog, not asserted (the first run decides the delta).
- The artifact is not landed into production `harness_runs` (no write credential); a ledger row is a hand step.

### Evidence
- Red: `pg-conn-loopback.test.mjs` against the old `pg-conn.mjs`: 8 failed, 1 passed (the unchanged fall-through case). Green after the change: 9 of 9, and the existing `pg-conn.npmtest.mjs` still 6 of 6.
- `preflight.test.mjs` 29 of 29 (each forbidden name, production URLs in three variables, a production key, a hidden host); `replay-migrations.test.mjs` 17 of 17 (fixture directory with duplicate prefix 006 and a gap, an unlisted and an absent file, stop rule, tolerate, skip, discovery mode, post checks); `write-local-env.test.mjs` 8; `run-lane-step.test.mjs` 4; `export-local-harness-runs.test.mjs` 6; `emit-chain-proof-artifact.test.mjs` 6; `chain-proof-workflow.test.mjs` 7 (dispatch only, contents read, one secret-holding step with only the two names, no forbidden name, preflight before every local step, subset not uploaded).
- The real inventory parsed against the real directory: 323 planned, 0 unlisted, 0 absent.

### NOT done
- Not fired. The replay has never run against a real database: which files cannot replay on an empty database is unknown until the first dispatch (`gh workflow run chain-proof.yml -f replay_continue_on_error=true`).
- Supabase CLI key names, Postgres version, `supabase status -o env` key names (`SERVICE_ROLE_KEY` or `SECRET_KEY`) and `supabase/setup-cli@v1` with `version: latest` are HYPOTHESES until that run.
- Subset export and load, chain steps, attack suite are other lanes' scripts; their steps skip by name.

### Open items
- A mapping from production names to files (or a ruling that these 46 rows are not errors) is needed before the replay can run; also whether the 17 skipped files (several clearly applied under other names, such as 202, 205, 206, 207, 225, 248, 299, 315, 317) should be applied.

### Rulings applied 2026-10-07 (second round)
- Rule 015: `crypto.hash("sha256", ...)` in `export-local-harness-runs.mjs`. Rule 022: the em dash in the secrets-registry note replaced by a comma.
- New `scripts/proof/sync-applied-migrations.mjs` (+ 4 tests) and the committed `fsi-app/docs/inventories/applied-migrations.json` (352 rows, run once on the scratch export).
