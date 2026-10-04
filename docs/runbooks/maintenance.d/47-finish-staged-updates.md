## 47. `finish-staged-updates`

**Purpose**: run every approved-never-materialized `staged_updates` row (33, April to July --
`status='approved'` AND `materialized_at IS NULL`, from the retired human-approval flow that predates
the machine-gated mint chokepoint) through the SAME chokepoint a fresh staged row already meets -- Part
7 task 7.5 item 2, RD-20 ("staged_updates is transit-only... a materialization failure ages into the
flag resolver... never a parked approved-unmaterialized orphan").

**Upstream**: `scripts/maintenance/finish-staged-updates.mjs`, calling `applyStagedUpdate`
(`src/lib/intake/apply-staged-update.ts`, imported unmodified via jiti) -- the ONE materialization
chokepoint `run-intake-cycle.ts`'s own STAGE->MINT step and `drainChangeSweepUpdates` already use. No
second gate: for `new_item` this runs the entity-gate then `mintIntelligenceItem` (congruence 1a/1b +
subject-existence dedup + the relevance floor); for `update_item`/`status_change`/`new_source`/
`archive_item` it applies the same fixed-shape UPDATE/INSERT those types always use.

**Write shape mirrors `run-intake-cycle.ts`'s own convention exactly**: a materialized row keeps
`status='approved'` (the RD-20 resolved state for this table) and stamps `materialized_at` +
`materialized_item_id` + `materialization_error=null` + `reviewed_by`/`reviewed_at`; a machine refusal
sets `status='rejected'` + `materialization_error` (the chokepoint's own reason, verbatim) +
`reviewed_by`/`reviewed_at`. No row is left `approved` with `materialized_at` still null.

**The scrape-hold clause, and why it does not currently bind any row here**: the dispatch requires "if
the materialization needs a fetch and the scrape hold is engaged, report 'held' per row, never bypass."
[CONFIRMED, full read of the entire call graph `applyStagedUpdate` reaches for all five update types --
`mintIntelligenceItem`, `flywheel-steps.mjs`'s `runDiscoveryStep`/`runForwardEventsStep`,
`syncComplianceDeadlineForItem`, `linkItemEntities`]: none of these perform an external fetch -- every
one is a Supabase read/derive/write over rows already in the database (grep for `fetch(`/`browserless`/
`canonical-fetch` across that call graph returns zero hits). Materializing a `staged_updates` row is the
MINT step only; the separate GROUND step (`generateBriefWorkflow`, which DOES fetch and is gated by
`SCRAPE_HOLD`) is `run-intake-cycle.ts`'s own later, distinct step for a brand-new candidate, and is
NOT run by this step -- a freshly-materialized `new_item` row with no brief yet is an ordinary
record-grade stub, task 7.3's research-or-erase/quarantine-disposition scope, not a second job folded
in here silently. `deps.holdEngaged()` is still checked and reported every run
(`scrape_hold_engaged_at_run_time` in the summary) so a future call-graph change that DOES introduce a
fetch is visible before it would ever run live.

**Ruling**: ADR-030 rider / RD-20. Not gated by a separate `arg` token. $0, no LLM, no fetch.

**Dispatch**: `mode=dry` runs every row through `applyStagedUpdate` with `dryRun: true` (the identical
gates, no write) and reports counts + a per-update-type breakdown + a 20-row sample per outcome. `mode=apply`
performs the real materialize-or-reject write per row.

**Artifact / read back**: `summary.json`'s `counts.{materialized,rejected}`, `by_update_type`, and
`read_back.approved_unmaterialized_remaining` -- confirm against `SELECT count(*) FROM staged_updates
WHERE status='approved' AND materialized_at IS NULL` (0 expected after a clean apply) and `SELECT
status, materialization_error FROM staged_updates WHERE reviewed_by='finish-staged-updates'` for the
per-row disposition.

---

