# 2026-10-08, lane MIG-374 (mig374-owed-schema): the two owed schema items and the lifecycle retry (migration 374, NOT APPLIED)

## Accomplished

- `fsi-app/supabase/migrations/374_gin_index_and_lifecycle_applied.sql` (header NOT APPLIED), one transaction:
  - `CREATE INDEX IF NOT EXISTS inference_records_cited_item_ids_gin_idx ON public.inference_records USING gin (cited_item_ids);` Plain form; the header states that CONCURRENTLY cannot run inside the apply transaction.
  - `ALTER TABLE public.signposts ADD COLUMN IF NOT EXISTS lifecycle_applied_at timestamptz;` nullable, no default, no backfill; `COMMENT ON COLUMN` names the two writes that set it.
  - Self-check: the index exists on `cited_item_ids`, access method gin, valid; the column exists, is timestamptz and nullable; a NOTICE reports how many fired signposts read as "lifecycle not recorded as applied".
- `fsi-app/supabase/migrations/374_gin_index_and_lifecycle_applied.test.mjs` (8 static tests).
- `fsi-app/src/lib/learning/prediction-scoring.mjs`: the lifecycle retry.
  - After `fireSignpost` succeeds for a firing (apply mode), `markLifecycleApplied` stamps `lifecycle_applied_at` (guarded write, only where still NULL).
  - A new repair pass in the sweep (2b): reads signposts with `fired_at IS NOT NULL AND lifecycle_applied_at IS NULL`, reads each assessment's current `lifecycle_state`, applies `nextLifecycleState(current, direction)` through `applyLifecycle` (assessment update only while still in the state read, then the stamp), chaining state across signposts on one assessment. A signpost fired in the same run is excluded.
  - Tolerates migration 374 being unapplied (reads fall back, stamp and repair skipped and counted as `lifecycle_skipped_column_absent`), kept separate from migration 353's tolerance.
  - New counts: `lifecycle_stamped`, `lifecycle_repair_planned`, `lifecycle_repaired`, `lifecycle_repair_no_assessment`, `lifecycle_skipped_column_absent`; they flow into the run artifact through the existing `signpostMetrics` prefix flattening.
- `fsi-app/src/lib/learning/prediction-scoring.test.mjs`: 13 new tests (38 total, all pass).
- `docs/inventories/migrations.md` regenerated with its generator (one row added).

## Read and reused

- Read in full: CLAUDE.md, `docs/dispatches/lane-common-contract.md`, `prediction-scoring.mjs` and its test, `signpost-watch.ts` (fireSignpost, nextLifecycleState), migrations 346 and 353 (+ the 353 test) and the header of 372, the two prior session-log entries the brief cites.
- Consumers found by grep and checked: `scripts/turns/run-propagation-drain.mjs` (the only caller of `runSignpostStep` and `buildSignpostStepDeps`; its test and `signpost-watch.test.mjs` re-run, 70 of 70 pass), `src/lib/detail/inference-view.mjs` (the `.contains("cited_item_ids", ...)` read the index serves).
- Reused, not rebuilt: `nextLifecycleState` (imported, not copied), `db.guardedUpdateByIds` for both new writes (rule 015), the existing `fetchAllRows` paginated read, the existing missing-column fallback pattern, the 353 migration layout and test shape, the migrations inventory generator.

## Decisions

- "Same write as the lifecycle update" cannot be one statement: the lifecycle lives on `research_assessments`, the new column on `signposts`, and the lifecycle update itself is inside `fireSignpost` (signpost-watch.ts, outside this lane's write set). The stamp is therefore the guarded write immediately after a successful `fireSignpost` (and, in the repair, immediately after the assessment update). The lifecycle write always comes first: stamping first would lose a transition on a crash; stamping second can at worst repeat one. The window is one round trip. Not a transaction; stated in the migration header and the module header.
- The repair guards the assessment update with `lifecycle_state = <state read>` and refuses to stamp when no row updated, so a concurrently moved assessment is retried next run, not stamped.
- No backfill in the migration (the brief names none, and a file cannot tell a failed lifecycle update from a succeeded one). See open items.

## NOT done

- `fireSignpost` itself is unchanged: it does not set `lifecycle_applied_at`; the stamp is made by the caller (`prediction-scoring.mjs`). Any other caller of `fireSignpost` (none found: only `prediction-scoring.mjs` imports it outside tests and the methods index) would not stamp.
- Migration 374 is not applied; nothing was run against any database.
- A step-2 failure inside `fireSignpost` (outbox row not written after `fired_at` is stamped) is a separate existing gap, not touched here: such a signpost is now caught by this repair (fired, lifecycle NULL) for its lifecycle, but its missing outbox row is not re-written.

## Open items

- Decision-ready, for the executor that applies 374: the NOTICE prints the count of fired signposts with `lifecycle_applied_at` NULL. Expected 0 in build mode. If it is not 0, run before the next propagation drain, only for rows whose assessment lifecycle did move: `UPDATE public.signposts SET lifecycle_applied_at = fired_at WHERE fired_at IS NOT NULL AND lifecycle_applied_at IS NULL;` (otherwise the first repair pass applies their transition a second time).
