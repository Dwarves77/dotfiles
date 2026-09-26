# 2026-09-26, Lane STATE-COST-PRODUCER

Operator ruling 2026-09-25: "build the producer" for `state_cost_facts` (migration 152, 0 live rows,
PENDING-by-design, read by `src/app/api/ask/route.ts:245` and `src/lib/supabase-server.ts:3507`, no
producer since 2026-07). R14 ("we are NOT updating the data on the site, we are building the tools that
manage that data first") holds this lane to fixtures/dry only, zero live rows.

## Accomplished

- `fsi-app/src/lib/regional/state-cost-facts-envelope.mjs`: pure grounding (verbatim span check against a
  capture), `originClassForTier` (T1-T3 -> official, T4 -> verified, direct analogy to
  `regional-facts-envelope.mjs`'s own rule), `buildStateCostFactRow`, and `planUpsert` keyed on the live
  `UNIQUE(state_code, dimension, fact_label)` constraint. 16 tests.
- `fsi-app/scripts/producers/regional/state-cost-facts-producer.mjs`: the orchestrator. Sources resolved
  through the registry, tier from `classTierForHost` (`src/lib/sources/host-authority.ts`, the institution
  class table), never hand-typed; an unclassifiable host is refused with a named reason
  (`refused_unrated_source`), never guessed. Downstream trigger (rule 17): mints/links a jurisdiction
  entity for every state a run touches, reusing `entity-plan.mjs`'s `planJurisdictionEntities`/
  `planJurisdictionRefs` unmodified. Kill switch `ENABLED=false`; the CLI's `--apply` path refuses
  outright (no live-write code exists yet) - R14 held twice, independently. The CLI's fixture/dry path
  was run for real (operator directive mid-session: "you HAVE to test what you're building"), writing a
  real harness artifact to the newly registered `state-cost` family
  (`scripts/harness-runs/state-cost/state-cost-run-001.json`).
- 9 tests on the producer itself, including an F27 composition proof (envelope + entity-plan seam
  asserted against live schema constraints) and the two refusal paths (ungrounded span, unrated source).
- Registered the `state-cost` harness family (`scripts/harness-runs/state-cost/family.json`) per
  CONVENTION.md; added a meta-harness `pending/` marker since meta-harness's own governing files include
  every family's descriptor.
- F25 (module-liveness) allowlist entry: the producer has no `.github/workflows/*.yml` dispatch root by
  design (wiring one would itself be a scheduling decision under R14), named with a reviewByPhase pointing
  at the R14-lift ruling.

## Investigated, not built (open question for the coordinator)

Automate-vs-hire DAG authorship at STATE grain, the pattern the existing `regional_data_facts` producers
trigger (`run-envelope-producer.mjs`'s `authorAutomateVsHireForRegions`). Not reusable verbatim:
`automate-vs-hire.ts`'s `findFactByDimension` hard-codes `ref.table !== "regional_data_facts"`, and
`state_cost_facts` carries no `value_numeric` column (migration 267 gave it only `origin_class`, not the
full number envelope) for the method to read even if the table check were widened. Building a
state-grain method or widening the registered one is a coordinator-level decision (a schema change or a
registered-method change), not a mechanical reuse this lane makes unilaterally.

## Corrections made honestly

- First attempt at the entity-spine downstream trigger assumed `resolveRegionEntityId` (region-grain,
  keyed to `regions.iso_codes`) would work at state grain; it does not (different ref_table shape).
  Switched to `planJurisdictionEntities`/`planJurisdictionRefs` (`src/lib/entities/entity-plan.mjs`),
  which is genuinely grain-agnostic (ISO 3166-2 detection built in).
- `guardedInsert`'s return shape (`{ inserted: <row> }`, not `{ inserted: boolean, data }`) was
  misread on first pass; fixed before any test ran against it.
- A literal `STATE_COST_GOVERNING_FILES` array in the producer script violated
  `governing-files.test.mjs`'s repo-wide sweep (no second hand-maintained governing-file list outside
  `governing-files.mjs`); replaced with `GOVERNING_FILES["state-cost"]`, derived from the family
  descriptor.
- House-style rule 022 (no em/en dashes in added prose) caught several lines across the new files and the
  F25 allowlist entry; all replaced with commas/periods. Stale, buggy harness-run artifacts generated
  before that fix (carrying the banned glyphs) were deleted rather than kept as noise; only the final,
  clean `state-cost-run-001.json` was committed.

## Blockers / open items for the coordinator

1. State-grain automate-vs-hire DAG authorship (above) - needs a ruling before it can be built.
2. Wiring the producer into a `producers.yml` dry-mode-only schedule (F25 allowlist's own
   `reviewByPhase`) is a separate, later, operator-ruled decision.

## Next steps

R14 lift ruling -> author real `--fixtures` content from actual sourced state cost figures (not the
hand-built test fixtures) -> flip `ENABLED` in a reviewed change -> wire the CLI's `--apply` path for
real, per the CLI contract comment already in the producer file.
