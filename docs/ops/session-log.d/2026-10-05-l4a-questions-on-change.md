# 2026-10-05 L4-A: questions fire when a value changes (lane l4a-questions-on-change)

## Accomplished (each item confirmed by a test run in this worktree)

- `src/lib/learning/questions-on-change.mjs` (new): `eventTypeForOutboxRow`, the mapping table
  `EMITTING_TABLE_EVENT_MAP`, `describeChange`, `buildEntityItemsReader`, `runQuestionsOnChange`. 15 tests.
- Mapping pinned: the test parses every migration for `propagation_outbox_trg` and fails when an emitting
  table has no mapping or the mapping names a table no migration attaches (six tables today).
- `trigger-questions.mjs`: `generateTriggerQuestions` takes `{eventType, eventId, change}`; the shared write
  half is now `mainForQuestions` (adds in-batch dedup); `main` calls it. Flag wording and the CITE reason now
  state "answered from holdings by a session batch" (ADR-044). `constants.mjs`: `QUESTION_ACQUISITION` is
  `holdings-session-batch`; the TRIGGER_EVENT_TYPES comment no longer claims a CHECK in migration 284.
- `scripts/lib/trigger-question-deps.mjs` (new): the one deps builder; `run-population-flywheel.mjs`
  `stepTriggerQuestions` now calls it (92 flywheel tests still pass).
- `drain.ts`: `processedEvents` returned (3 new tests). `run-propagation-drain.mjs`: `questionsOnChangeStep`
  runs after the drain, `qoc_*` metrics in the artifact (4 new tests).
- ADR-044 landed verbatim as `docs/decisions/ADR-044-learning-loop-no-gate.md` (044 was free); one status
  line added under ADR-036's frontmatter.

## Read and reused

Reused: `generateTriggerQuestions`, `triggerQuestionFlagRow`, the dedup rule, `db.guardedInsertMany` and
`db.readAll`, `fetchAllRows` and `fetchAllByIdChunks` (paginate.mjs), the entity link of migration 283
(`intelligence_items.instrument_entity_id`, `entity_refs`) read in reverse, the same two paths
`resolve-watched-entities.ts` reads forward. Built new only what had no home: the table-to-event mapping,
the entity-to-item reverse read.

## Decisions

- `statutory_computations` maps to `obligation_amended`; `emission_factors` supersede maps to
  `factor_superseded`; every other emitting table and kind maps to `value_revised`. signpost_fired,
  confidence_decayed, source_frozen have no emitting table and stay unmapped.
- Cap: 25 items per event (4 questions each); dropped count reported as `items_dropped_by_cap`.
- The originating event id is carried in the flag row's `recommended_actions[0].rationale`
  (`event_id=<id>`), because integrity_flags has no column that fits and no migration is allowed here.
- F28: only family `propagation` governs files this lane edited (drain.ts, run-propagation-drain.mjs);
  pending marker added. `run-population-flywheel.mjs`, `src/lib/learning/**` are governed by no family.

## What is NOT done

- No question is answered (lane L4-B). No migration, no live run, nothing applied.
- A drained event whose questions step then fails is not replayed: events are marked drained in Pass 1
  before the step runs. The failure is recorded as a defect on the run artifact and fails the exit code.
- Outbox rows from emission_factors, market_series and regional_data_facts carry no entity_id today, so
  they reach no item (counted as `events_no_entity`).
- propagation-drain.yml chained firings run dry while `scrape_cadence='off'` (the chained-dry-guard step,
  workflow lines 209 to 211 and the `RUN_MODE="dry"` lines 233 and 272), so a chained firing raises no
  question. At population time (cadence no longer off) the guard leaves the requested mode, the
  `workflow_run` branch requests `apply`, and the step then writes. Nothing to change in the workflow.
- The flywheel's comment at the `trigger-questions` step descriptor still says "never auto-answered"; it
  is outside this lane's write set (only the deps extraction was).

## Open items

- INDEX line owed (coordinator): `- [ADR-044-learning-loop-no-gate](./decisions/ADR-044-learning-loop-no-gate.md) - learning loop runs with no operator gate and no priced request; supersedes ADR-036 decisions 1 and 3 (accepted 2026-10-05)`.
- `src/lib/sources/seek-more.mjs` still names `operator-priced-only` in comments and the acquisition
  request text (not this lane's file).
