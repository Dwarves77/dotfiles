# Last proposer pass — change-detection

Per `PROPOSER-RUNBOOK.md` §2's attestation format. `change-detection` now has **five** artifacts
(`change-detection-run-001` … `change-detection-run-005`); F28's rule (d) requires this file to name the
latest verbatim: **change-detection-run-005**.

## Pass of 2026-09-04 (lane PROPOSER-3 — change-detection-run-005: the first dispatch under CD-GATE's landed gate-reading code, discharging its own `PENDING-RUN.md`)

**Artifact read:** change-detection-run-005 (dry, Actions run `33825967861` per this branch's own commit
message `f79c6d36`, 2026-09-04T01:30:59.590Z, `harness_version sha256:fcb23ec75e03c512`, `check_limit 10`,
`reconcile_batch 200`, `drain_limit 5`).

**Full traces read:** `traces/change-detection-run-005.result.json`, byte-diffed directly against
`traces/change-detection-run-004.result.json` (the prior pass's own baseline, itself byte-identical to
run-003's).

**What the diff shows [CONFIRMED, read from both trace files directly, `diff` run byte-for-byte]:** the
two traces are NOT identical, unlike run-003 vs run-004. run-004 (apply, old pre-CD-GATE hash) carries
`"mode": "apply"`, `check.skipped: false`, an HTTP-200 route response body
(`"Scraping is off (cadence 'off' or emergency stop); worker exiting"`, `checked: 0` etc.) and a
`verifiedByRead` block. run-005 (dry, new hash) carries `"mode": "dry"`, `check.skipped: true`, a
`reason` string ("dry mode never calls a route that writes..."), and — new fields not present in run-004
at all — a `gate` object (`cadence: "off"`, `open: false`, `reason: "cadence_off"`, a `detail` string
naming ADR-015 §3), `dueCount: 959`, and a 10-row `dueSample`; the reconcile block gained `dryRun: true`
and the drain block's shape changed from `result.items/drained/approved/rejected/notDrained` to
`dryRows: []` / `overflow: 0`. This is expected mode difference (dry vs apply), not itself a defect.

**Whether the new per_item gate rows and metrics appear as designed [CONFIRMED against
`scripts/turns/run-change-detection.mjs`'s own `shapeRunOutput`, read directly, lines ~241-330]:** yes,
for the parts a DRY run exercises. The artifact's `per_item[0]` is `{id: "scrape-gate", outcome:
"gate_closed", verdict: "scrape gate CLOSED (cadence_off) ..."}` and `per_item[1]` is `{id:
"check-sources", outcome: "skipped", verdict: "check skipped (dry mode never calls a route...); 959
source(s) due... but 0 checkable while the gate is closed (cadence_off) (sample of 10, capped at
--check-limit=10)"}`, followed by 10 `due:<id>` rows — exactly the shape `shapeRunOutput`'s `gate`/`check`
branches build when `check.skipped` is true. `metrics.scrape_gate` = `{open: false, reason: "cadence_off",
cadence: "off", start_date: null, emergency_paused: false}` and `metrics.sources_checkable: 0` — matching
the source's own formula (`check.skipped ? (gate ? (gate.open ? check.dueCount : 0) : null) : null`,
line ~370) exactly, and matching CD-GATE's own prediction (`scrape_gate cadence_off, sources_checkable
0`) verbatim. **One precise qualifier, from reading the source, not inferred:** the `"gate_closed_at_route"`
classification — the label CD-GATE's fix exists specifically to correct run-003/004's mis-classified
`"checked"` outcome — is assigned only in the `else` branch of `shapeRunOutput` (`check.skipped === false`,
i.e. an APPLY run that actually calls the route; source line 281: `outcome: !check.ok ? "route_error" :
exitedAtGate ? "gate_closed_at_route" : "checked"`). Because run-005 is DRY, `check.skipped` is `true`,
so that branch — and the `"gate_closed_at_route"` label itself — is never reached by this run. run-005
therefore confirms the new gate-read fields/metrics exist and read correctly, but does NOT itself test
whether the mis-classification CD-GATE's `PENDING-RUN.md` names as its motivating defect is actually fixed
— that requires an APPLY run under this same hash, which has not yet been dispatched.

**`PENDING-RUN.md` status — discharged, per F28 rule (c)'s reverse-audit.** **[CONFIRMED]**
`change-detection-run-005.json`'s `harness_version` is `sha256:fcb23ec75e03c512`; this pass independently
re-hashed the CURRENT tree's change-detection `GOVERNING_FILES`
(`scripts/turns/run-change-detection.mjs`, `src/lib/sources/reconcile.ts`,
`src/lib/intake/run-intake-cycle.ts`, via `hashHarnessVersion` run directly) and got the identical
`sha256:fcb23ec75e03c512` — an exact match. `scripts/harness-runs/change-detection/PENDING-RUN.md` no
longer exists on disk (directory listed directly — confirmed absent), consistent with the prior pass's own
statement that the marker "is discharged only by a future `change-detection-run-005` (or later) whose own
`harness_version` reads `sha256:fcb23ec75e03c512`" — that is exactly what happened; the deletion is the
correct discharge, not an omission.

**Proposal:** none warranted beyond what CD-GATE's own (now-discharged) `PENDING-RUN.md` already named as
the pending work. The next dispatch this family needs is an APPLY run under `sha256:fcb23ec75e03c512` —
the run that will actually exercise the `"gate_closed_at_route"` branch and prove (or disprove) that the
fix corrects what run-003/004 mis-reported as `"checked"`. That is not this lane's call to dispatch (no
Actions dispatch access from this lane), and `scrape_cadence` staying `'off'` (ADR-015 §3, the operator's
word only) is a standing spend constraint, not a defect — an apply run under the new hash while cadence
stays off would show `sources_checked: 0` exactly as run-005 does, still without exercising
`gate_closed_at_route` (that branch fires on the ROUTE's own gate exit, which an apply call does trigger
even with cadence off — see `check.ok && routeExitedAtGate(check.body)`, unlike dry mode which never calls
the route at all). So an apply dispatch, not a cadence flip, is what closes this open verification, and it
does not require spend beyond what run-003/004 already spent on the pre-fix code.

**Family gates status:** this landing adds one run artifact (change-detection-run-005) and this
attestation only; no governing-file change from this lane (CD-GATE already landed the hash this run
carries, before this lane's dispatch).

## Pass of 2026-09-03 (lane ARTIFACTS, landing runs 002–004 from three unlanded Actions branches)

**Artifacts read:** change-detection-run-001 (dry, 2026-09-02T12:43Z, `sha256:331700b02e68fe83`),
change-detection-run-002 (dry, Actions run `33760706916`, 2026-09-03T13:22:27Z, same hash),
change-detection-run-003 (apply, Actions run `33761608697`, 2026-09-03T13:31:55Z, same hash),
change-detection-run-004 (apply, Actions run `33804312977`, 2026-09-03T20:48:15Z, same hash). All four
were pushed to their own `change-detection/<run_id>` branches (Actions PR-creation is refused for this
repo) and landed here by cherry-pick, in chronological order, none previously on master.

**Full traces read:** `traces/change-detection-run-002.result.json`,
`traces/change-detection-run-003.result.json`, `traces/change-detection-run-004.result.json` (run-001's
was already read by the prior pass). Run-003's and run-004's trace files are **byte-identical**
(diffed directly) — the same closed-gate state measured twice, seven hours apart.

**What the artifacts show [CONFIRMED, read from the artifact JSON and its traces]:**
- **run-002 (dry):** 959 sources due for a check (unchanged from run-001's baseline), 0 checked (dry
  never calls the writing route); 10 sampled `due_not_checked` rows, 1 `skipped` check-sources
  placeholder row. 0 pending/staged/drained.
- **run-003 and run-004 (apply):** both report `sources_checked: 0`, `changes_detected: 0`,
  `portal_candidates_touched: 0`, `staged: 0`, `drained: 0`. Both `per_item`'s single `check-sources`
  row carries the identical verdict: `"HTTP 200: Scraping is off (cadence 'off' or emergency stop);
  worker exiting — 0 source(s) checked"`. Both artifacts classify this outcome `"checked"` (not
  `"gate_closed_at_route"`), because both ran under `harness_version sha256:331700b02e68fe83` — the
  code as it stood BEFORE lane CD-GATE (2026-09-03) added the honest `gate_closed_at_route`
  classification. This is the exact defect CD-GATE's own `PENDING-RUN.md` names as its motivating
  root cause: an apply that reconciles 0 and drains 0 because the scrape gate is closed, reported as if
  it were a completed check.
- **Not a defect, and not new:** `system_state.scrape_cadence = 'off'` is a standing spend constraint
  (ADR-015 §3, "the loop/cadence flip is the operator's word only") — cadence stays off for the whole
  build, so 0-checked applies are the expected result of dispatching this family right now, not a bug in
  the family's own chain. Neither run-003 nor run-004 records anything in `defects_found` for this
  reason, and this pass agrees with that call.
- **The apply's own `proposer_notes`** (both run-003 and run-004) name a second, already-understood
  property, not a new one: in apply mode with `--skip-check` unset, `check-sources/route.ts` already runs
  its own in-process reconcile, so this driver's own Step B reconcile is a second pass over the same rows
  and a near-zero `changes_recorded`/`staged` on an apply is expected even when the gate is open.

**PENDING-RUN.md status — left in place, per F28 rule (c):** the family's current governing-files hash
(re-computed from the live tree: `scripts/turns/run-change-detection.mjs`, `src/lib/sources/reconcile.ts`,
`src/lib/intake/run-intake-cycle.ts`) is `sha256:fcb23ec75e03c512` — this is CD-GATE's own gate-reading
change, already landed on master (commit `59d00aee`). **None of the four artifacts on record match this
hash** — all four still carry the pre-CD-GATE `sha256:331700b02e68fe83`, because run-004 (the newest)
was dispatched before CD-GATE's code landed. `PENDING-RUN.md` records `harness_version at write time:
sha256:fcb23ec75e03c512`, which is exactly the current hash, so F28 rule (c) treats the drift as
honestly acknowledged and raises no violation. This marker stays in place; it is discharged only by a
future `change-detection-run-005` (or later) whose own `harness_version` reads `sha256:fcb23ec75e03c512`
— the first dispatch under the landed CD-GATE code, which this lane has no dispatch access to trigger.

**Proposal:** none warranted from this pass beyond what CD-GATE's own `PENDING-RUN.md` already names —
the next dispatch (dry, then apply) under the landed gate-reading code is the pending work, and it will
either show `scrape_gate.reason = cadence_off` / `sources_checkable = 0` honestly classified as
`gate_closed_at_route` (if cadence is still off) or a real check count once the operator flips
`system_state.scrape_cadence`. Neither is this lane's call to make.

**Family gates status:** this landing adds three run artifacts and this attestation only; no
governing-file change from this lane (`change-detection`'s `harness_version` is unchanged by this pass —
CD-GATE already landed it on master before this lane started).

## Pass of 2026-09-02 (change-detection-run-001) — retained verbatim

**Artifact read:** change-detection-run-001 (dry, GitHub Actions run 33631450443, 2026-09-02T12:43Z,
`sha256:331700b02e68fe83`, `check_limit 10`, `reconcile_batch 200`, `drain_limit 5`) and its
`traces/change-detection-run-001.result.json`.

**What it shows:** 959 sources due for a check, none checked (dry never calls the route, which writes
`sources`/`monitoring_queue`/`portal_link_candidates`); the ten sampled due sources are listed per item
(`due_not_checked`, EUR-Lex tier-1 regulations first); 0 pending change rows, 0 staged updates, 0 drained.
The chain's state before its first apply is exactly what the live table said on 2026-09-02 morning: nothing
pending because the check-sources route has not run since the acquisition freeze.

**What the first apply will cost and show:** `check_limit` sources rendered through Browserless (2 units
each estimated, unconfirmed against billing), then the route's own in-process reconcile, then this driver's
second reconcile (expected near-zero, the route claimed the rows) and the drain (≤5 staged updates re-verified
at $0). Dispatch with `check_limit 10` first and read `changes_detected` against `monitoring_queue`.
