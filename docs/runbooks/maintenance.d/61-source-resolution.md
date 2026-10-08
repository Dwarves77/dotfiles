## 61. `source-resolution`

**New this runbook, lane S1-E, 2026-10-05 (CLAUDE.md rule 17).** Not a `maintenance.yml` step: it is a chained
workflow, `.github/workflows/source-resolution.yml`, that runs two existing maintenance steps (46
`resolve-provisional-sources`, 58 `recompute-tiers`, and, since lane TRUST-RET 2026-10-07, 66 `recompute-trust-scores`) through the shared `./.github/actions/maintenance-step`
composite action, the same way `downstream-chain.yml` runs 02 and 58.

**Purpose**: nothing that registers a new provisional source may end without the sources being resolved and their
tiers moved. Brief apply (S1-A, free brief path) and Research walker (S1-D, publisher register-and-rate) create
provisional sources; before this workflow nothing ran after them.

**Flow**:
1. `Brief apply` or `Research walker` completes. Both are chain roots, so the firing is depth 1 (F60 needs no
   explicit-dispatch fallback). The job runs only when the upstream conclusion was `success`.
2. The chained dry guard (`scripts/lib/chained-dry-guard.mjs`) forces the run dry while
   `system_state.scrape_cadence = off` (rule 16, build mode). A hand dispatch honours its `mode` input.
3. `resolve-provisional-sources` (section 46): promotes or activates every provisional source the class table or a
   committed host verdict can place; an unplaceable host stays on the worklist.
4. `recompute-tiers` (section 58): moves `effective_tier` one tier either side of `base_tier`, never over an admin
   `tier_override`.
4a. `recompute-trust-scores` (section 66): recomputes the `sources.trust_score_*` columns after the tier move; writes
   no tier column. Its counts (sources scored, held by a per-source pause, scores written) are recorded in the artifact.
5. `scripts/turns/emit-source-resolution-artifact.mjs` writes the run's artifact on every firing (even a failed
   step): per step the counts the step prints (sources resolved, promoted, rejected, worklisted, verdict-placed;
   sources scanned, tier movements planned or applied), the trigger, this run's github run id and the upstream
   run id. `deliver-artifact-branch.sh` lands it into `harness_runs`.

**Loop hops**: `brief-apply-to-source-resolution` and `research-walker-to-source-resolution`
(`fsi-app/.discipline/governance/loop-hops.d/12-*.json`, `13-*.json`). Each is proven fired by a
`source-resolution` row with trigger `workflow_run` or `workflow_run_forced_dry` and an `upstream_run_id` equal to
that producer's own github run id. Tier recompute also runs inside Downstream chain (hops 05 and 06 notes).

**Dispatch** (dry, the only mode used before every build layer is complete):
`gh workflow run source-resolution.yml -f mode=dry`. `mode=apply` writes through the guarded path and is not used
in build mode. No schedule.

**What the artifact records on a dry run**: counts of what the steps WOULD resolve and move; `trigger` is
`workflow_dispatch` for a hand dispatch and `workflow_run_forced_dry` for a chained firing in build mode.
`upstream_run_id` is absent on a hand dispatch.
