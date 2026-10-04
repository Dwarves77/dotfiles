## Change

Lane s1a-source-register (2026-10-04): two of this family's governing files change.
`scripts/turns/apply-record-briefs.mjs` now passes each entry's cited sources (claim urls and ids plus
`metadata.sources_used`) to the grow step, and previews the same registration in dry mode;
`src/lib/agent/canonical-pipeline.ts` `growSources` takes one new optional parameter for that list.
Covered by fixture tests (`scripts/turns/apply-record-briefs.test.mjs`,
`src/lib/sources/source-growth.entry-citations.npmtest.mjs`), not a live `brief-apply` run.

## Planned run

The next `.github/workflows/brief-apply.yml` dispatch, landing the next `brief-apply-run-NNN.json`. Delete
this file the moment that artifact lands.
