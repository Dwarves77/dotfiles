# 2026-10-11 HALF-1 (half1-obligation-writer): obligation_objects gets its writer

Lane HALF-1, branch lane/half1-obligation-writer, cut from origin/master 38de6adc7. Executor lane. Facts only; each one was confirmed by the method named. Fixtures and injected deps only, no live access.

## Accomplished

- Writer module `fsi-app/scripts/obligations/derive-obligation-objects.mjs`: takes candidate provisions (pinpoint, verbatim text, duty-holder classes, applicability trigger, optional dates, scope and cost slots), proves each against its held capture with the database guard's own rule, and plans one `obligation_objects` row per accepted candidate. INSERT-only; status always `not_assessed`; ids `cl:obligation:<16 hex>` from `entityId("obligation", item|pinpoint|vN)`; a changed provision at an existing pinpoint is a new version whose `supersedes` names the current row; a re-run plans nothing. Refusals carry a named reason and are reported, never silently dropped.
- Wired into `derive-obligations.mjs` `main` (`deriveRegister` is the original body, unchanged; `main` then runs the object phase). `--candidates <file>` on the standalone CLI; `--arg <file>` on the maintenance wrapper `fsi-app/scripts/maintenance/derive-obligations.mjs`, which now reports `summary.objects` and fails the step (exit 1) on an inserted/planned mismatch.
- Chain: the wrapper is already the `derive-obligations` step of `downstream-chain.yml` (hop 05) and of `run-population-flywheel.mjs` step 8, so a mint reaches the object phase with no new step. In the chain no candidate file is passed: the phase runs, reads nothing, writes nothing, and reports `candidates: 0`.
- Outbox: the writer does not emit events. Migration 376 puts `emit_propagation_event('obligation_id','instrument_entity_id')` on the table, and the guard trigger fills `instrument_entity_id`; the writer never sets that column (asserted by a test), so every inserted row reaches the flywheel through the table's own trigger.
- Dry by default; the object phase takes the same `apply` flag as the register phase, so the shared build-mode gate (`chained-dry-guard.mjs`, forced dry while `scrape_cadence='off'`) covers both.
- Fixture file gained a `capture_id` on each of its four captures (fixtures are the only rows this lane ever feeds the writer).
- Tests: `scripts/obligations/derive-obligation-objects.test.mjs` (12), `scripts/maintenance/derive-obligations.test.mjs` (4, 2 new). Existing `derive-obligations.test.mjs` (31) and `obligation-gate.test.mjs` (17) still pass.

## Structured actions finding (brief item 1)

Structured actions are NOT obligation objects. They are a distinct stage with a different source, grain and destination. Decision: keep `dry-run-structured-actions.mjs` and its harness family; nothing deleted.

- Source: `extractRecommendedActions` reads prose sections of the generated `full_brief` (`fsi-app/src/lib/agent/extract-recommended-actions.mjs:79`, `DO_NOW_SECTIONS_BY_ITEM_TYPE`, 10 of its 12 item types carry a do-now section; regional_data and research_finding carry none). An obligation object is read from the instrument's own text in a held capture (376 header decision 2).
- Fields: an action is `{action_text, verb, timeframe_days, owner, due_date, source_section}` (`extract-recommended-actions.mjs:179`). It has no pinpoint citation, no verbatim text, no capture, no binding position, no duty-holder class and no applicability trigger, the columns 376 requires NOT NULL. Its `due_date` is the date of a recommended task stated in analysis prose, not an obligation date, so it cannot fill `first_deadline` without inventing meaning.
- Grain: the spec defines the action as "a task with an owner and a due date" on the obligation card (`docs/specs/07-page-walkthrough.md:56`), i.e. the customer's control action. 376 excludes `owner` and `control_action` from the table as customer-entered data (`376_obligation_objects.sql:36`).
- Destination: the coordinator ruling of 2026-09-28 names `intelligence_items.recommended_actions` (`fsi-app/scripts/turns/apply-record-briefs.mjs:821`), a column no migration has created (grep of `supabase/migrations` finds `recommended_actions` only on `integrity_flags`, migration 048). The extractor is also called from `apply-record-briefs.mjs:832` in dry mode, so deleting the dry-run script would not remove the extractor.
- Consequence for brief item 3: no deletion, and no wiring of actions as input to derive-obligations, because no obligation_objects field can honestly receive one.

## Read and reused

- Read: CLAUDE.md, wave2.md HALF-1 section, COMMON.md, obl1.md, obl2.md, migration 376 whole, spec 01 sections 3.2 to 3.6, `derive-obligations.mjs` whole, `dry-run-structured-actions.mjs` whole, `extract-recommended-actions.mjs`, `relevance.mjs` (obligation grain), `scripts/maintenance/derive-obligations.mjs`, the chain wiring in `run-population-flywheel.mjs` and `scripts/proof/steps/chain-steps.json`, `db.mjs` guarded writers, `entity-id.mjs`, `chained-dry-guard.mjs`. The OBL-1 register is not in this worktree (docs/audits copy not opened; its facts were taken from the OBL-2 session log, which cites it).
- Reused: `guardedInsertMany` (cited audit-sink write), `entityId("obligation", ...)`, `currentObligationObjects` and `fetchObligationObjectsForItem` (the reader the end-to-end test calls), `classifyItemBindingPosition` (injected, the one home of binding rules), `DUTY_HOLDER_CLASSES` and `BINDING_POSITION` vocabularies, the existing derive-obligations chain step, the 376 fixture file, migration 376's guard and outbox triggers.

## Decisions

1. Candidates are the only input. No deterministic reader of an instrument's text can produce a pinpoint, duty-holder class or trigger (record-facts extraction yields identity, scope and date slots, not per-provision obligations), and a model call is forbidden (rule 7), so provisions arrive as a grounded drain batch and the writer verifies and writes them.
2. Candidate `binding_position` (obligation grain) wins over the instrument-level classifier; the classifier (identity, record-facts, title, monitoring_only from the candidate's own duty holders) is the fallback; neither means the candidate is refused, never guessed.
3. The writer pre-checks the guard's span rule and the table CHECKs (trigger shape, frequency, mode aliases, effort-not-money, dates) so a dry run predicts what the database would refuse.
4. `status` is written `not_assessed` and a candidate carrying `yes` or `no` is refused: a position is taken by a person (spec 01 section 3.2).
5. Insert-only means an admin-set value on an existing row can never be overwritten by this writer (common rule 6).

## NOT done

- `obligations.obligation_id` (forward events hanging off objects) is not populated; 376 ships it nullable with no backfill and linking is a data-track step. [NOT-WORK: data track, population holds until every build layer is complete (operator ruling 2026-10-04)]
- No candidate batch exists, so no live row is written by anything. [NOT-WORK: population after all layers, fixtures only]
- Structured actions have no destination column; `intelligence_items.recommended_actions` was ruled on 2026-09-28 and never created, so the stage stays extraction-preview only. [WORK: owed]
- Source of candidate batches (the grounded drain lane that authors the candidate file from captures) is not built here. [WORK: owed]

## Open items

- The standalone CLI and the wrapper read a candidate file path from `--candidates` / `--arg`; the drain lane that produces it must emit rows shaped like `src/lib/obligations/fixtures/obligation-objects.fixture.json` objects plus `capture_id`. [WORK: owed]
