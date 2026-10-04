## Change

Lane S1-C (s1c-tier-movement, 2026-10-04) added the `recompute-tiers` step to
`.github/workflows/maintenance.yml` (one new entry in the `step` choice list and one new step block calling
the shared `./.github/actions/maintenance-step` action over `scripts/maintenance/recompute-tiers.mjs`).
The step is dry by default and has no schedule. No other step or gate in the file changed.

## Planned run

The coordinator's next `.github/workflows/maintenance.yml` dispatch (any step, dry or apply), landing the
next `maintenance-run-NNN.json`. Delete this file the moment that artifact lands.
