## 58. `recompute-tiers`

**New this runbook, lane S1-C (s1c-tier-movement), 2026-10-04.**

**Purpose**: the source tier system runs itself. Moves `sources.effective_tier` from the evidence through
the one calculator in `src/lib/trust.ts` (`decideEffectiveTier`, driven by `planTierMovements` /
`applyTierMovements`). `base_tier` is the institution class tier and is never written here. Evidence, each
applied automatically and each reversible on the next recompute (the decision is recomputed from
`base_tier` every run, never stacked on the stored value):
1. citation promotion (`scoreCitationEdges`): one tier better;
2. `evaluatePromotion` eligible: one tier better;
3. `evaluateDemotion` triggered: one tier worse (the removed `critical_conflict` trigger stays removed; see
   `DEMOTION_TRIGGERS` in `types/source.ts`);
4. tier opinions: 3 or more non-dismissed opinions in the last 90 days from at least 2 distinct opining
   sources whose median differs from `base_tier` move one step toward the median. `host_class_table`
   opinions (section 2) are not evidence here.

5. scored prediction outcomes (lane L4-D, ADR-044 decision 4): the `source_reliability_ledger` holds one row
   per source per scored prediction (`held`, `refuted`, `partial`), appended by the propagation drain
   (`src/lib/learning/prediction-scoring.mjs`). With at least 5 scored outcomes in the last 365 days, refuted
   over held moves one step toward demotion, and held with no refuted moves one step toward promotion
   (`outcomeMovement` in `trust.ts`); anything else moves nothing. It is one more delta inside the same clamp,
   read as ONE bounded query of the ledger window per run (`readOutcomes`). The ledger never writes a tier,
   needs no ratification, and a missing ledger (migration 353 unapplied) contributes nothing. `summary.json`
   `counts` reports these apart: `outcome_movements`, `outcome_promotions`, `outcome_demotions`,
   `other_movements`, `outcome_read_error`, and each `sample` entry carries `outcome_driven`. The event row is
   the existing `tier_promotion` or `tier_demotion` with `details.outcome_driven` and `rules` naming
   `prediction_outcomes`.

Net movement is clamped to one tier either side of `base_tier`. An admin `tier_override` always wins and is
never written over (planner skips it, and the write itself carries `tier_override IS NULL`). A source with
`processing_paused` keeps its last-known tier. Every applied change writes a `source_trust_events` row
(`tier_promotion` or `tier_demotion`, `created_by` "worker", `details.applied` true, with `rule`, `rules`,
`before_tier`, `after_tier`, `deltas` and the inputs).

**Same logic, two entries**: `POST /api/admin/recompute-trust` (the admin action; it applies after its trust-score
pass and no longer only proposes demotions) and this step. Both call the planner and applier in `trust.ts`. The
trust-score pass itself is section 66 (`recompute-trust-scores`); the `trust-recompute.yml` workflow that used to
call the route was retired 2026-10-07.
**Emergency stop (lane TRUST-RET, 2026-10-07)**: the step reads `system_state.global_processing_paused` before
anything else and, when set, plans and writes nothing (`summary.json` `paused: true`, `pause_reason`, exit 0), as
the route does. An unreadable flag fails closed. The cadence is a separate read and stays the hold below.

`extended_inaccessibility` now requires `status = 'inaccessible'`, matching its declared condition, so a
source that is merely not being scanned does not fire.

**Dispatch**: no `--arg`, no ruling gate, no schedule. `mode=dry` reads and plans, writes nothing;
`mode=apply` writes through `scripts/lib/db.mjs` (`guardedUpdateByIds`, `guardedInsert`). Also runs after
`tier-opinions` in `downstream-chain.yml` through the shared `./.github/actions/maintenance-step` action (section 33's chain).
A `workflow_run`-chained firing is forced dry while build mode is live (rule 16, F61).

**Artifact / read back**: `summary.json` `counts` (`sources_scanned`, `override_held`, `skipped`,
`movements`, `promotions`, `demotions`, `sample`) and, in apply, `read_back` (`attempted`, `applied`,
`write_failed`, `event_failed`, `failures`). Exit code 1 when any write or event failed. Confirm against
`SELECT count(*) FROM source_trust_events WHERE created_by = 'worker' AND details->>'applied' = 'true'`.

**Idempotency**: a second run over unchanged inputs finds every stored `effective_tier` equal to its
decision and writes nothing.

**Cadence hold (rule 16)**: while `system_state.scrape_cadence` is `off`, the `no_substantive_update`
demotion trigger is suppressed, because it reads scan timestamps that cannot advance during the hold. It
contributes no delta and `summary.json` reports the count as `counts.held_cadence_off` (with
`counts.scrape_cadence`). The step reads `system_state` once per run through `readAll`; the route reads
it once through `getScrapeState`. Any value other than `off` suppresses nothing. Other triggers
(conflict rate, chronic inaccessibility, self-citation) still fire during the hold.

---

