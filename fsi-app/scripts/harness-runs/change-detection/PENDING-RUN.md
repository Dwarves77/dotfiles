# Pending run — change-detection

F28's staleness-coupling rule (rule (c), `.discipline/fitness/functions/F28-harness-run-integrity.mjs`)
fires when a family's governing files re-hash to something no valid artifact on record carries. This
marker is the honest acknowledgment that rule anticipates — written in the exact format
`parsePendingRunHash` reads (`harness_version at write time: `sha256:...``).

**What changed:** lane CD-GATE (2026-09-03), diagnosing why change-detection run-004 (Actions run
`33804312977`, `--mode apply`) reported `[check] HTTP 200 ok=true sourcesChecked=0` while 959 sources
satisfied the due-predicate. Root cause, read from `src/app/api/worker/check-sources/route.ts` and
confirmed live (`system_state.scrape_cadence = 'off'`, `scrape_start_date = null`,
`global_processing_paused = false`): the route exits at `pause.ts isGloballyPaused()` BEFORE its
due-sources SELECT, returning HTTP 200 with `sourcesChecked: 0` and "Scraping is off (cadence 'off' or
emergency stop); worker exiting". The driver's dry mode mirrored only the due-predicate, so dry said "959
due" and apply checked 0, and the artifact classified that apply as `checked`. The gate itself is not
bypassed by this lane: cadence OFF is a standing spend constraint (ADR-015 §3) and "the loop/cadence flip
is the operator's word only" (PROGRAM-BOARD standing constraints, 2026-07-13).

One governing file moved:

- `scripts/turns/run-change-detection.mjs` — new pure exports `evaluateScrapeGate` (the route's own gate
  order: emergency stop → cadence off → scrape day, with `scrapeWindowOpen` injected) and
  `routeExitedAtGate` (recognises both "…; worker exiting" responses). `main()` now reads the gate in BOTH
  modes through `pause.ts readScrapeState` (new: the THROWING form of the route's fail-closed
  `getScrapeState`, so an unreadable `system_state` is a run error, never a "cadence_off" verdict) +
  `scrape-schedule.ts scrapeWindowOpen`, both imported via jiti rather than re-implemented. Artifacts gain
  a `scrape-gate` per_item (`gate_open` | `gate_closed`), `metrics.scrape_gate`,
  `metrics.sources_checkable` (the due count only while the gate is open, else 0) and
  `metrics.route_exited_at_gate`; an apply whose route response carries the worker-exiting message is
  classified `gate_closed_at_route`, never `checked`; a disagreement between the local gate read and the
  deployed route is its own `gate_cross_check_mismatch` per_item, never swallowed.

`src/lib/api/pause.ts` (the `readScrapeState` addition) and `.github/workflows/change-detection.yml`
(header + `check_limit` description corrected — the route has accepted `limit` and returned totals since
the driver's second commit) are not governing files for this family, so neither is part of the hash below.

**harness_version at write time:** `sha256:fcb23ec75e03c512`

**The planned run that supersedes this marker:** the next `change-detection` dispatch (dry, then apply)
under this landed code — its artifact will carry `scrape_gate.reason = cadence_off` and
`sources_checkable = 0` until the operator sets `system_state.scrape_cadence` / `scrape_start_date`
(the admin control `POST /api/admin/sources/pause-global`, ADR-012 §1 mechanism carried forward by
ADR-015), which is his config action, not this lane's. Per F28's reverse-audit, this marker is deleted the
moment that artifact lands and its `harness_version` matches the hash above (or re-pinned to a new hash,
per rule (c), if the governing file changes again before that run lands).
