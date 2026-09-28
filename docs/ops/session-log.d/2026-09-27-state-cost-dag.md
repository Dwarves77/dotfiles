# 2026-09-27, Lane STATE-COST-DAG

Coordinator decision (per the app's existing pattern, migration 285 + the regional producers): build
option A for the state-grain automate_vs_hire DAG-authorship question PR #811 left open. R14 still holds
("we are NOT updating the data on the site"): migrations drafted, NOT applied; producer wired dry-mode
only.

## Accomplished

- Drafted two migrations (renumbered 332/333 per coordinator instruction, migration 331 was taken by
  `coord/harness-landing`):
  - `supabase/migrations/332_state_cost_facts_value_numeric.sql`: adds `state_cost_facts.value_numeric`
    NUMERIC, nullable, additive, zero backfill.
  - `supabase/migrations/333_derivation_edges_allow_state_cost_facts.sql`: widens migration 285's
    `derivation_edges_from_table_allowed` CHECK to add `state_cost_facts`.
  - Both carry rollback files under `supabase/rollbacks/`, both explicitly marked DO NOT APPLY pending
    sign-off.
- `src/lib/regional/state-cost-facts-envelope.mjs`: `buildStateCostFactRow` now emits `value_numeric`
  (mechanical parse of `candidate.value` via new `parseNumericValue`, never a second authored figure).
- `src/lib/propagation/methods/automate-vs-hire.ts`: widened `findFactByDimension`'s table allowlist to
  accept `state_cost_facts` alongside `regional_data_facts` (the computation itself is grain-agnostic).
- `scripts/producers/regional/state-cost-facts-producer.mjs`: new `authorAutomateVsHireForStates`,
  groups a run's built rows by state, and for a complete hourly-wage + energy pair, authors (apply) or
  PREVIEWS (dry) one `automate_vs_hire` edge through the EXISTING `authorEdges` -> `register_derived_value`
  path. Dry mode is a TRUE preview (unlike the region-grain precedent, which no-ops for dry): fake
  `resolveInputs`/`registerDerivedValue` read from in-memory rows, the REAL registered method computes.
- Ran the CLI end to end in dry mode against a widened fixture set (added a California
  `operational_cost` candidate so CA completes a wage+energy pair): one edge previewed, a real computed
  NPV (~-1.696M USD), entity `cl:jurisdiction:776cec61a9f36def`. Harness artifact
  `scripts/harness-runs/state-cost/state-cost-run-003.json`.
- 5 new tests for `authorAutomateVsHireForStates` (preview, incomplete-pair skip, non-hourly-wage skip,
  apply-mode routing) plus a CLI end-to-end assertion; 2 new tests on `automate-vs-hire.test.mjs` (state
  grain acceptance, non-allowlisted table rejection); extended the F27 composition proof to cover all 4
  producer seams (added `author-edges.mjs` + `operations/automate-vs-hire.mjs`).
- Removed the per-worktree `node_modules` junction per the operator's #815 fix; worktrees now resolve the
  shared install via `.claude/worktrees/node_modules` automatically (pre-push step 0b self-heals).

## Corrections made honestly

- Renumbered migrations 331/332 -> 332/333 after migration 331 was claimed by `coord/harness-landing`;
  updated every in-file cross-reference and every code/test comment citing the old numbers.

## Blockers / open items for the coordinator

None beyond the standing one: migrations 332/333 await operator/coordinator sign-off before apply.

## Next steps

Sign-off -> apply 332 then 333 (schema-first, per the two-track migration policy) -> flip `ENABLED` in a
reviewed change -> the CLI's `--apply` path (still unauthored) starts writing for real.
