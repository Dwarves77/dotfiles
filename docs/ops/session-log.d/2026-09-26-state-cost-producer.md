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

1. State-grain automate-vs-hire DAG authorship, decision-ready package below - needs a ruling.
2. Wiring the producer into a `producers.yml` dry-mode-only schedule (F25 allowlist's own
   `reviewByPhase`) is a separate, later, operator-ruled decision.

### Decision-ready: state-grain automate-vs-hire DAG authorship

Governing docs: spec 08 (`docs/specs/08-flywheel-design.md`) section 2.2 (derivation_edges is the
invalidation DAG, "derived from the provenance chain, not hand-maintained") and its own section-2.3
worked example, which names "Operations: 4 automate-vs-hire results that used the factor" as the
canonical thing a DAG authorship call connects; section 3.3 (the pollution barrier, `admissibleFor`,
irrelevant to which table feeds the method but confirms every consumer of a derived value goes through
one gate, not this table). ADR-023 (producer execution model): "store, producer, reader and runner ship
together, or the work order is not done" - the DAG-authorship question is exactly this bar applied one
layer further (producer, reader AND downstream-connector, per CLAUDE.md rule 17).

**What the existing regional producers author, and why.** `run-envelope-producer.mjs`'s
`authorAutomateVsHireForRegions` calls `author-edges.mjs::authorEdges` with
`{table:"regional_data_facts", id:<wage-or-energy-row-id>, method:{id:"automate_vs_hire",
version:"1.0.0"}, inputs:[{table:"regional_data_facts",pk:wage.id},{table:"regional_data_facts",
pk:energy.id}]}` whenever a region's labor_markets (hourly wage) + operational_cost (energy) pair is
BOTH present. `automate-vs-hire.ts`'s `findFactByDimension` then resolves those inputs, filtering
`ref.table !== "regional_data_facts"` and requiring `typeof row.value_numeric === "number"`. This is the
literal spec-08 section-2.3 worked example: "Operations: 4 automate-vs-hire results" are these rows.

**Option A: add `value_numeric` to `state_cost_facts`.**
```sql
-- new migration, additive, mirrors migration 267's own origin_class-only step for this table
ALTER TABLE public.state_cost_facts
  ADD COLUMN IF NOT EXISTS value_numeric numeric;
COMMENT ON COLUMN public.state_cost_facts.value_numeric IS
  'Numeric mirror of value (TEXT). Nullable, additive, no backfill in this migration - lets
   registered derivation methods (automate_vs_hire) read state-grain facts the same way they
   read regional_data_facts.value_numeric.';
```
Then `buildStateCostFactRow` (state-cost-facts-envelope.mjs) gains one field
(`value_numeric: Number(candidate.value)` when parseable, else null); no other code changes.
`findFactByDimension`'s table filter widens to accept `"state_cost_facts"` too (a 1-line change in
`automate-vs-hire.ts`), AND `derivation_edges_from_table_allowed` (migration 285's CHECK, currently
`emission_factors, market_series, regional_data_facts, derived_values, statutory_computations,
estimated_values`, state_cost_facts is NOT a member) needs the SAME widening - so option A is not
schema-free, it is one small additive migration plus one CHECK widen.

**Option B: widen the registered method's table check without adding a column.** Not viable on inspection:
`findFactByDimension` requires `typeof row.value_numeric === "number"`, and `state_cost_facts` has no such
column at all (migration 267 gave it only `origin_class`). Widening the table-name filter with no
column to read from is a silent no-op (every state_cost_facts input would resolve to
`row.value_numeric === undefined`, refused as "no resolvable... input"), so option B COLLAPSES INTO
option A: there is no code-only path, the column has to exist either way.

**Consumers checked (B1, grep across `src`/`scripts`):** `state_cost_facts` readers are
`src/lib/supabase-server.ts:3507` and `src/app/api/ask/route.ts:245`, BOTH use explicit column lists
(`state_code, state_label, dimension, fact_label, value, unit, trend, statute_citation, effective_date,
origin_class, source:sources(name)`), neither `select("*")` - adding `value_numeric` breaks zero
consumers (additive-only). `automate-vs-hire.ts`/`findFactByDimension` consumers:
`author-edges.mjs`, `run-envelope-producer.mjs` (region-grain, unaffected by a widen), `seed-derived-
values.mjs` (region-grain, same), `AutomateVsHireCalculator.tsx` + `EstimatedFigure.tsx` (render
`derived_values`/`estimated_values` rows post-computation, table-agnostic, unaffected). No consumer
breaks under either option; the real cost is TWO migrations (state_cost_facts.value_numeric,
derivation_edges CHECK widen), not a pure code change, for either option.

**Recommendation (one line):** build option A (add `value_numeric`, widen the table filter, widen the
CHECK) in a follow-up lane once the coordinator rules on it - it is genuinely the only viable path, has a
tiny migration diff, breaks no consumer, and needs no method-version bump since `automate_vs_hire`'s
computation itself (wage + energy -> NPV) is grain-agnostic, only its *input resolution* needs widening.

## Next steps

R14 lift ruling -> author real `--fixtures` content from actual sourced state cost figures (not the
hand-built test fixtures) -> flip `ENABLED` in a reviewed change -> wire the CLI's `--apply` path for
real, per the CLI contract comment already in the producer file.
