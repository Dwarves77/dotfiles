## Change

Lane s2a-typed-edges (2026-10-04): `scripts/turns/apply-record-briefs.mjs`, a governing file of this family,
gains one per-item step, `lineage`, between `structured-actions` and `discovery`. It runs `linkItems`
(`src/lib/entities/link-items.ts`) over the item's just-written brief so a lineage phrase beside a held
instrument's identifier writes the typed edge (amends, implements, depends_on); dry mode previews it and
writes nothing. `APPLY_STEP_ORDER` grows from 9 to 10 steps. Covered by fixture tests
(`scripts/turns/apply-record-briefs.test.mjs`, `src/lib/entities/link-items.npmtest.mjs`), not a live
`brief-apply` run.

## Planned run

The next `.github/workflows/brief-apply.yml` dispatch, landing the next `brief-apply-run-NNN.json`. Delete
this file the moment that artifact lands.
