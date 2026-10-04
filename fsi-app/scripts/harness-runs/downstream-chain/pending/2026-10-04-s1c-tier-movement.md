## Change

Lane S1-C (s1c-tier-movement, 2026-10-04) added a `recompute-tiers` step to
`.github/workflows/downstream-chain.yml`, directly after `tier-opinions`, through the shared
`./.github/actions/maintenance-step` action. The step follows this run's own `RUN_MODE` and `RUN_SKIP`
like its siblings. `scripts/turns/emit-downstream-chain-artifact.mjs` now lists `recompute-tiers` in `STEPS`, so its summary
is read into the artifact (write-set expansion approved by the coordinator), and the description text of
`.github/actions/maintenance-step/action.yml` names the new step. No behaviour change to the action.

## Planned run

The coordinator's next `downstream-chain.yml` dispatch landing the next `downstream-chain-run-NNN.json`.
Delete this file the moment that artifact lands.
