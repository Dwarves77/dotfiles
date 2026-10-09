# 2026-10-05 L4-D: predictions are scored when the watched entity changes, and source reliability moves on the score

Lane l4d-predictions-reliability (ADR-044 decision 4, ADR-043). Fixtures only, nothing applied, no database, no network.

## Accomplished (each item confirmed by a test run in this worktree)

- Migration 352 (NOT applied): `emit_propagation_event()` takes an optional second trigger argument naming an entity column; the `emission_factors` trigger is re-attached with `('factor_id','corridor_id')`. An entity is recorded only when an `entities` row exists (the FK on `propagation_events.entity_id` would otherwise roll back the factor write). Self-check runs on rolled-back TEMP fixtures.
- Migration 353 (NOT applied): `signposts` gains `inference_record_id`, `outcome` (held|refuted|partial), `outcome_assessed_at`, `scored_by`; new `source_reliability_ledger` (append-only trigger, UNIQUE (source_id, signpost_entity_id), RLS on, no policy). Self-check attacks the append-only guard (UPDATE and DELETE must be refused).
- `assess.mjs`: `assessSignposts`; `assessHorizon` names its anchor event. Producer plans and writes one signposts row (plus its signpost entity) per dated R1 or R3 expectation, idempotent on a seed of item id plus forward event id.
- `signpost-watch.ts`: `fireSignpost` insert fixed against migration 284 (`change_kind` "update", `entity_id` the watched entity, `old_row`/`new_row` say what moved and why). Predicate type gains optional `by`.
- `src/lib/learning/prediction-scoring.mjs` (new): match, fire, score, ledger, deadline sweep, repair, real deps with an outcome-column fallback. `drain.ts` carries `newRow` on `processedEvents`. `run-propagation-drain.mjs` runs the step after the drain, replays failed events with the existing unfinished-ids mechanism, adds `sp_*` metrics.
- `trust.ts`: `outcomeMovement`, `tallyOutcomes`, `TierEvidence.outcome`, `outcome_driven`; planner reads outcomes through an optional `readOutcomes`; `recomputeEffectiveTier` reads the ledger itself. `recompute-tiers.mjs` reads one bounded ledger query and reports outcome movements apart. Runbook step 58 updated.

## Read and reused

Read: code register Q4 to Q8, ADR-024/025/036/038/039/043/044, learning-loop design section 3, migrations 258, 268, 106, 274, 282 to 286, 338, 339, 346, 004, `drain.ts`, `run-propagation-drain.mjs`, `signpost-watch.ts`, `assess.mjs`, the producer, `read-signposts.mjs`, `trust.ts`, `recompute-tiers.mjs`, L4-A and L4-B session logs.
Reused: `evaluateSignpostPredicate`, `fireSignpost`, `nextLifecycleState`, the outbox and its drain, L4-A `processedEvents` and the unfinished-ids replay, `entityId('signpost', seed)`, `guardedInsert`/`guardedUpsert`/`guardedUpdateByIds`/`guardedInsertMany`, `fetchAllByIdChunks`, `fetchAllRows`, `decideEffectiveTier` and its clamp, the existing `tier_promotion`/`tier_demotion` event types, migration 346's `signposts`.

## Decisions

- Producer expectation (the one assumption to review): an R1 or R3 horizon anchored on a dated forward event is stated as "movement on the item's instrument entity by that date": predicate `{op:"date_passed", field:"occurred_at", by:<date>, basis:"movement_by_date"}`, direction confirms. It fires on a drained event for the entity on or before `by`; a `by` that passes with no firing scores refuted. R4, refusals, no entity, and past dates yield no signpost.
- Scoring: confirms held, refutes refuted, delays partial; deadline refuted; `scored_by` = `signpost_watch@1.0.0` for both; scored once; ledger written first, then the score, so a crash retries (repair path).
- Ledger join: `signposts.assessment_id` -> `research_assessments.item_id` -> `section_claim_provenance` FACT and LEGAL claims with a source, distinct sources.
- Tier thresholds: 5 scored outcomes minimum in 365 days; refuted over held +1; held with no refuted -1; else 0; inside the existing clamp; `tier_override` wins.
- No new `source_trust_events` event_type is needed.
- F28: families `propagation` (drain.ts, run-propagation-drain.mjs) and `research-assessment` (assess.mjs, the producer); pending markers added. `recompute-tiers.mjs`, `trust.ts`, `signpost-watch.ts` and the new module are governed by no family.

## Added after coordinator rulings on PR 949

- CI fixes: unused arg, the F27 composition proof (the producer test now asserts the plan's signpost id is `entityId('signpost', seed)` and the row meets the table's constraints), F39 markers placed on the line above each `.in()`.
- `recompute-trust/route.ts` carries the outcome reader; ONE reader (`outcomeReaderFor` in `trust.ts`) is shared with `recompute-tiers.mjs`.
- `questions-on-change.mjs`: `signposts` maps to `signpost_fired`. The fired row reaches the drain through `fireSignpost`'s own explicit outbox insert (entity_id = watched entity), so migration 353 does NOT attach a trigger to `signposts` (a generic trigger would add a duplicate event on the fired_at update and another on every scoring update). The mapping test's emitting-table derivation now also counts tables code writes an outbox row for (parsed from `signpost-watch.ts`).
- `signpost-watch.ts` header states what a research-assessment signpost predicts (held by an event by the date, refuted by silence).
- Superseded assessments: the producer re-points the unscored signposts of the old assessment to the new one (`repointSignposts`, guarded, non-fatal, dry writes nothing).

## What is NOT done

- `market_series` and `regional_data_facts` outbox rows still carry no entity: neither table has a column naming an entity (`market_series` keys on `series_key` text; `regional_data_facts` on `region_id` to `regions`, which reaches entities only through the multi-valued `entity_refs`). Not guessed. [CLOSED: PR 1026]
- Lifecycle transition not retried: if `fireSignpost` stamps `fired_at` but its assessment lifecycle update fails, the repair pass scores the signpost but cannot tell whether the lifecycle moved (a confirms transition is not idempotent). Exact change needed: add `signposts.lifecycle_applied_at timestamptz` (a migration after 353), set it in the same write as the lifecycle update, and have the repair path apply `nextLifecycleState` only where it is NULL. [WORK: DFIX-1]
- Nothing applied; migrations 352 and 353 were not run against any Postgres. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
