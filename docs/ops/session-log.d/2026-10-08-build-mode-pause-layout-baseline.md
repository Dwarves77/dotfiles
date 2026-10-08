# 2026-10-08, coordinator lane: pause the layout-guard expiry and 7-day renewal rule until go-live

## Ruling

Operator, 2026-10-08, verbatim: "We are building the fucking site. Make it simple and pause the 7 day rule
until the site goes live." CLAUDE.md rule 16 (build mode). No ADR, per the coordinator.

## Accomplished

- Dispatched `layout-baseline-renewal.yml` (run 37706124820, success, 0 harness errors, count 792 to 338)
  on the window start, then did NOT commit its artifact: the ruling superseded the renewal. The three
  artifact files were discarded from the worktree. The artifact was never committed or merged.
- New `fsi-app/.discipline/governance/build-mode.mjs`: `BUILD_MODE = true`, header cites the ruling and rule 16,
  names flipping it to false as the go-live step. No earlier BUILD_MODE constant existed in the governance
  layer (grep), so this is the one switch.
- `rendering/layout-guard/baseline.mjs`: `applyBaseline` and `needsRenewal` take an injectable `buildMode`
  (default `BUILD_MODE`). In build mode a past-expiry baseline keeps applying (`expired` false, `pastExpiry`
  and `notice` still reported) and `needsRenewal` is false. New `baselineAgeNotice` reports age and days to
  expiry. `run-layout-guard.mjs` logs the notice. New findings still block.
- `layout-guard-expiry.test.mjs`: new attack tests (BUILD_MODE true with a past-expiry baseline passes with a
  logged notice; BUILD_MODE false returns the old red behaviour; 7-day rule paused and restored), the
  standing gate now also asserts `baseline.json` parses and agrees with its count and logs its age. Existing
  expiry and renewal attacks pin `buildMode: false` so they keep proving the cliff. The "missing writtenAt"
  attack uses `''` and `null`, never `undefined`: `undefined` triggered the default parameter and read the
  live `baseline.json`, so it went red the moment any renewal was written.
- `layout-guard.npmtest.mjs`: its expiry split test pins `buildMode: false`.
- Runbook: "Paused until go-live" section; the workflow is left in place and is not required before go-live.

## Confirmed facts

- Red first: the new tests failed on the missing `baselineAgeNotice` export before the implementation.
  Green after: 18 of 18 in the expiry file, 45 of 45 in the layout-guard npmtest.
- Mutation: with `BUILD_MODE = false` the standing gate and the constant test go red (the old behaviour
  returns), then reverted.

## Owed

- The layout-guard generator writes an em dash into audit element names (`button[MEAF0` + U+2014 + `no
  discussions yet]`), which the commit rule 022 (no dash glyphs in added prose) rejects when the audit
  markdown is regenerated and committed. Generator fix owed (`run-layout-guard.mjs`), not done here.
- `baseline.json` holds 792 key entries but only 690 distinct keys (duplicate keys in the array); the `Set`
  loaded by `loadBaseline` is smaller than `count`. Pre-existing, not touched.
- Required-check versus continue-on-error for the rendering guard: deferred to go-live with the rule.
- Go-live: flip `BUILD_MODE` to false, after renewing or re-dating the baseline per the runbook.
