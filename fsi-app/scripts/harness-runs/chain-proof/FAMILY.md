# chain-proof family

Registered by lane PROOF-1, 2026-10-07. Decision record: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md`.

`.github/workflows/chain-proof.yml` (dispatch only, 60 minute limit, one at a time)
starts a disposable local Supabase stack on the runner, replays every migration file onto the empty database
(`scripts/proof/replay-migrations.mjs`), and is the home for the later steps: the production subset export (the one
step holding read credentials), the subset load, the chain steps in hop order with read-back assertions, and the
attack suite. Each later step is a script under `scripts/proof/`; `run-lane-step.mjs` runs it or records a named
skip while its lane has not landed.

Every step after the export runs with the local stack's environment only. `scripts/proof/preflight.mjs` asserts
that at the start of each step and fails the job on a production host or any forbidden credential name.
`scripts/lib/pg-conn.mjs` has a loopback mode (CHAIN_PROOF_LOCAL=1) that never falls through to a production host.

One firing leaves one run artifact written by `scripts/proof/emit-chain-proof-artifact.mjs`: replay counts, one
defect per migration that did not replay and per failed post check, one entry per later step (ran, skipped with the
owning lane, or failed), and the number of local `harness_runs` rows. The repository is public, so the artifact is
counts, migration file names and hashed ids only. It is uploaded as the `chain-proof-report` workflow artifact (7
days). It is NOT landed into production `harness_runs`: the job holds no production write credential. If the operator
wants a production ledger row for a green run, that is a separate hand step.

**Standing metrics**: `replay_failed` (target 0), `replay_post_checks_failed` (target 0), `steps_failed` (target 0),
`steps_skipped` (falls to 0 as the later lanes land).

Dispatch: see `docs/runbooks/maintenance.d/64-chain-proof.md`.
