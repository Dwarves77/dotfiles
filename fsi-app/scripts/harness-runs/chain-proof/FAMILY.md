# chain-proof family

Registered by lane PROOF-1, 2026-10-07. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`.

`.github/workflows/chain-proof.yml` (dispatch only, 60 minute limit, one at a time)
starts a disposable local Supabase stack on the runner and applies a schema-only dump of production to it
(`dump-production-schema.mjs` then `apply-schema-dump.mjs`): that is the proof schema. It is the home for the later
steps: the production data subset export (the one step holding production credentials, with the dump), the subset
load, the chain steps in hop order with read-back assertions, and the attack suite. After the data proof, the
migration FILES are replayed as discovery, never a gate, onto a second empty database (`replay_check`,
`create-replay-db.mjs`, `replay-migrations.mjs`), and `schema-diff.mjs` compares the result with the proof schema
by names and counts. The files do not reproduce production (352 applied rows with diverging names, 46 with no file,
17 files with no applied row); the findings land in the artifact. Each later step is a script under `scripts/proof/`; `run-lane-step.mjs` runs it or records a named
skip while its lane has not landed.

Every step after the export runs with the local stack's environment only. `scripts/proof/preflight.mjs` asserts
that at the start of each step and fails the job on a production host or any forbidden credential name.
`scripts/lib/pg-conn.mjs` has a loopback mode (CHAIN_PROOF_LOCAL=1) that never falls through to a production host.

One firing leaves one run artifact written by `scripts/proof/emit-chain-proof-artifact.mjs`: schema apply
counts, replay counts and findings (migration files that did not replay, applied rows with no file, files with no
applied row), the schema diff counts, one defect per failed schema statement and per failed post check, one entry per later step (ran, skipped with the
owning lane, or failed), and the number of local `harness_runs` rows. The repository is public, so the artifact is
counts, migration file names and hashed ids only. It is uploaded as the `chain-proof-report` workflow artifact (7
days). It is NOT landed into production `harness_runs`: the job holds no production write credential. If the operator
wants a production ledger row for a green run, that is a separate hand step.

**Standing metrics**: `schema_apply_fatal_errors` (target 0), `schema_diff_differing` (falls as the files are
repaired), `replay_failed`, `replay_post_checks_failed`, `steps_failed` (target 0),
`steps_skipped` (falls to 0 as the later lanes land).

Dispatch: see `docs/runbooks/maintenance.d/64-chain-proof.md`.
