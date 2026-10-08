## 66. `recompute-trust-scores`

**New this runbook, lane TRUST-RET, 2026-10-07 (CLAUDE.md rules 13 and 17).** Replaces the retired
`.github/workflows/trust-recompute.yml` (dispatch only, its schedule disarmed 2026-09-04). Ruled 2026-10-05
(Option 1, `docs/ops/session-log.d/2026-10-05-s1e-source-chain.md`): retire the workflow, keep the admin route,
keep the trust-score pass as a maintenance step.

**Purpose**: recompute the trust score columns of every source that is not on a per-source hold:
`trust_score_overall` (the Bayesian-prior blend of the earned score and the `base_tier` prior,
`computeOverallScore` in `src/lib/trust.ts`), `trust_score_accuracy`, `trust_score_timeliness`,
`trust_score_reliability`, `trust_score_citation`, and `trust_score_computed_at`. Nothing else is written: never
`effective_tier`, `base_tier` or `tier_override`. Tier movement is section 58 (`recompute-tiers`); a trust score is a
pure function of the source row, so an admin `tier_override` cannot make a score wrong.

**One logic**: the computation is `planTrustScores` in `src/lib/trust.ts`. `POST /api/admin/recompute-trust` (the
admin action, kept) and this step both call it, so the formula, the distribution and the per-base-tier averages
exist once. The step adds no web call, no `APP_URL` and no `WORKER_SECRET`.

**Emergency stop**: `system_state.global_processing_paused` halts the run before any read or write, as the route
does (`scripts/maintenance/lib/emergency-pause.mjs`, shared with section 58). `summary.json` then carries
`paused: true` and `pause_reason`, exit 0. A pause flag that cannot be read fails closed (no write). The scrape
cadence is not a stop here: the trust-score pass reads no scan timestamp, so build mode (cadence `off`) does not
switch it off.

**Chained**: it is the third step of `source-resolution.yml` (section 61), after `recompute-tiers`, so the score pass runs
whenever Brief apply or Research walker completes. A chained firing is forced dry while `scrape_cadence = off` (rule 16),
and `emit-source-resolution-artifact.mjs` records the step's counts (`sources_scored`, `skipped_paused`, `scores_applied`)
in that run's artifact.

**Dispatch**: no `--arg`, no ruling gate, no schedule. `mode=dry` reads and plans, writes nothing; `mode=apply`
writes through `scripts/lib/db.mjs` (`guardedUpdateByIds` snapshots the prior row and requires the
`source-credibility-model` cite). Also reachable under `step=all` (dry). Dry is the only mode used before every
build layer is complete.

**Artifact / read back**: `summary.json` `counts` (`sources_read`, `sources_scored`, `skipped_paused`,
`distribution`, `tier_averages`, `sample`) and, in apply, `read_back` (`attempted`, `applied`, `write_failed`,
`row_not_matched`, `failures`). Exit code 1 when any write failed; the sweep continues past a failed row. Confirm
against `SELECT count(*) FROM sources WHERE trust_score_computed_at >= '<run start>'`.

**Idempotency**: a second apply over unchanged inputs rewrites the same score values; only
`trust_score_computed_at` moves.

---
