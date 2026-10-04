## Change

Lane S1-C (s1c-tier-movement, 2026-10-04) added a `recompute-tiers` step to
`.github/workflows/downstream-chain.yml`, directly after `tier-opinions`, through the shared
`./.github/actions/maintenance-step` action. The step follows this run's own `RUN_MODE` and `RUN_SKIP`
like its siblings. `scripts/turns/emit-downstream-chain-artifact.mjs` lists the steps whose summaries the
artifact reads; it is outside this lane's write set, so the new step's summary is not yet in the artifact
(recorded as NEEDS WRITE-SET EXPANSION in the lane report).

## Planned run

The coordinator's next `downstream-chain.yml` dispatch landing the next `downstream-chain-run-NNN.json`.
Delete this file the moment that artifact lands.
