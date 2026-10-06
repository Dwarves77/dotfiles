# source-resolution family

Registered by lane S1-E, 2026-10-05 (buildout plan Stage 1 S1-E, CLAUDE.md rule 17).

`.github/workflows/source-resolution.yml` runs after `Brief apply` or `Research walker` completes
successfully (depth 1, so no explicit dispatch fallback). It runs `resolve-provisional-sources` and then
`recompute-tiers` through the shared `.github/actions/maintenance-step` action. While build mode holds
(`system_state.scrape_cadence = off`, rule 16) a chained firing is forced dry, so a run records what it would
resolve and move and its `harness_runs` row carries `trigger: workflow_run_forced_dry`.

Each firing, including a failed one, lands one artifact written by
`scripts/turns/emit-source-resolution-artifact.mjs`: per step the counts the step already prints, the trigger,
this run's github run id and the upstream run id. The two loop hops that name this family are
`brief-apply-to-source-resolution` and `research-walker-to-source-resolution`; each is proven fired by a row of
this family whose `upstream_run_id` equals that producer's own github run id.

**Standing metric**: steps that wrote a summary with no nonzero exit per firing (`steps_with_summary`,
`steps_nonzero_exit`), and the source and tier movement counts the two steps report.
