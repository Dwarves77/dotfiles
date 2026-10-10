## 69. `plan-quarantine-disposition`

**New this runbook, lane DOCS-5, 2026-10-10** (the step itself shipped in lane QUARANTINE-DISPOSITION, 2026-09-28; it had
no runbook step file until now). It is the planner half of the research-or-erase invariant: remediation-discipline
sections 2.1 and 2.2.

**Purpose**: for every live-quarantined item, decide a disposition and write the plan down. The planner reads the
live-quarantined items and their open flags, takes a recover verdict per eligible item from the reused resolver
(`scripts/regen-quarantined.mjs` `runResolver`, a $0 cheap-verify against the stored snapshot), classifies each item's
dwell state with `scripts/lib/quarantine-dwell.mjs` `computeQuarantineDwell`, and for every item that is past its dwell
bound, not recovered this run and carrying no valid deferral, builds a deferral-candidate row whose reason names the
specific blocking class. `scripts/lib/deferral.mjs` `isValidDeferral` rejects a vague reason mechanically.

**Upstream**: `fsi-app/scripts/plan-quarantine-disposition.mjs` (`runPlanner`), called unmodified by the wrapper
`fsi-app/scripts/maintenance/plan-quarantine-disposition.mjs`. Nothing is reimplemented in the wrapper.

**Dispatch**: `maintenance.yml`, `step=plan-quarantine-disposition`. `mode=dry` (the default, and what `all` fans out to)
plans and reports; it writes no plan file. `mode=apply` writes exactly two things: `plan.json` in this step's out dir and
this run's own harness-run artifact (`fsi-app/scripts/harness-runs/quarantine-disposition/`, recorded best effort to the
`harness_runs` table, which is operational metadata). It never writes to `intelligence_items` or `integrity_flags`.
`arg` = `dispatch-apply-deferrals` additionally calls step 70 (`apply-deferrals`) in that step's own `dry` mode against the
plan it just wrote, so the hand-off is exercised without writing a row. Any other `arg` leaves the hand-off off.

**Chaining**: step 70 reads this step's `plan.json` when its own `arg` is blank (the two out dirs are siblings under the
run's `OUT_ROOT`, so no hand-authored file is needed). Rule 17: this step is not done until its plan is the input of
step 70 and the run artifact records the counts.

**Artifact / read back**: `summary.json` carries `counts` (per disposition class), the deferral-candidate count and the
read-back run id; the harness-run artifact is the durable record. Idempotent: a re-run replans from the live set, and
an item that gained a valid deferral between runs is classified `already-deferred`.

**Reversal**: none needed, nothing live is written. Deleting `plan.json` and the artifact removes the run.

---
