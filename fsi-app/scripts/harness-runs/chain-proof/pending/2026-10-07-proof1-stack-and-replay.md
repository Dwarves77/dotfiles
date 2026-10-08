## Change

Lane PROOF-1 (2026-10-07) registered the `chain-proof` family: the dispatch-only workflow
`.github/workflows/chain-proof.yml`, the minimal local stack config `fsi-app/supabase/config.toml`, the migration
replay runner, the isolation preflight, the local env writer, the lane step wrapper, the artifact emitter, and the
loopback mode of `scripts/lib/pg-conn.mjs`. All proven on fixtures only; the workflow has not been fired.

## Planned run

The coordinator's first dispatch of `chain-proof.yml` after this lane merges (the exact `gh workflow run` line is in
`docs/runbooks/maintenance.d/64-chain-proof.md`). It uploads the first `chain-proof` run artifact. This marker is
superseded by that run; delete it in the change that lands it.
