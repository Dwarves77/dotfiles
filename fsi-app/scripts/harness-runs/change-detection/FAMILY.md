# change-detection family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`change-detection` (lane CD, change-detection runtime, 2026-09-02), registered over
`scripts/turns/run-change-detection.mjs` and the two library modules it drives directly,
`src/lib/sources/reconcile.ts`'s `runReconcilePass` (previously reachable only as a callee inside
`check-sources/route.ts`) and `src/lib/intake/run-intake-cycle.ts`'s `drainChangeSweepUpdates`
(previously reachable only from `runIntakeCycle`'s own apply-mode tail): a seventh shape again, whose
"runs" are a three-step chain, detect (POST the deployed check-sources route), reconcile (claim pending
`monitoring_queue` change rows into `intelligence_changes` + a `staged_updates` bridge), drain (apply +
re-verify the bridged `update_item` rows), never a mint, an extraction, or an enumeration walk. At the
time this family was registered it was not added as a row to the historical `harness_version` table
CONVENTION.md used to carry (see that table's own retired note); this family's governing files are named
directly in its own `family.json` (lane N2, 2026-09-19) instead.

**change-detection's standing metric** (build plan section 2's "measurement, not assertion," per family):
*chain-completion rate*, of the `monitoring_queue` rows a run's own detect step (or an inherited backlog,
`--skip-check`) marks `change_detected=true`, the fraction that make it all the way to a drained
`staged_updates` disposition (`update_applied`/`update_rejected`) in the SAME run, versus the fraction left
`pending` past `--drain-limit` (`not_drained`, always reported, never silent, the same bounded-and-reported
posture `source-sweep`'s `notBridged`/`notSwept` and this family's own `drainChangeSweepUpdates` already
apply), plus *Browserless cost per detection pass*: `metrics.browserless_units_est`, an ESTIMATE (this
repo does not document Browserless's own per-render metered price; see `run-change-detection.mjs`'s header
for the closest live reference), reported per run so a proposer pass can see spend trend alongside
throughput, the same pairing `mint`'s validator-pass rate and `forward-events`'s precision/coverage pair
serve for their own families.
