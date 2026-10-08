# Layout-guard baseline renewal runbook

Procedure for renewing `fsi-app/.discipline/rendering/layout-guard/baseline.json`, the site-wide layout
guard's dated, per-entry exemption list (`fsi-app/.discipline/rendering/layout-guard/baseline.mjs`). Not
dated itself: this is a repeatable procedure, re-used every time the baseline approaches its expiry.

## Paused until go-live (operator ruling 2026-10-08)

Operator ruling, 2026-10-08, verbatim: "We are building the fucking site. Make it simple and pause the 7
day rule until the site goes live." (CLAUDE.md rule 16, build mode.)

- `fsi-app/.discipline/governance/build-mode.mjs` exports `BUILD_MODE = true`. While it is true, the hard
  cliff (`isExpired`'s effect in `applyBaseline`) and the 7-day renewal warning (`needsRenewal`) do NOT fail.
  A baseline past `BASELINE_EXPIRY_DATE` keeps covering its entries, and the standing test still asserts
  `baseline.json` parses and agrees with its own count, and logs the baseline's age and days to expiry as a
  notice (`baselineAgeNotice`). Present-state checks are untouched: a NEW layout finding still blocks and the
  count may still only shrink.
- Nothing in this runbook is required before go-live. `layout-baseline-renewal.yml` stays in the repo
  (dispatch only, no schedule) and no renewal is due on 2026-10-08 or 2026-10-15. The 2026-10-15 date is
  not an event while `BUILD_MODE` is true.
- GO-LIVE STEP: flip `BUILD_MODE` to `false`. That restores the behaviour described in the sections above
  in the same commit, so renew first (Path A, "Renewal by workflow") or set a new expiry (Path B) in the
  go-live change, or it goes red on purpose.
- The required-check versus continue-on-error question for the rendering guard is deferred to go-live with
  the rule.

## Why there are two gates, not one

The baseline carries `BASELINE_EXPIRY_DATE` (currently `2026-10-15`; read the constant live, not this
line). Two separate mechanisms key off that date:

1. **The hard cliff** (`isExpired`): on or after the expiry date, the baseline stops applying and every
 baselined finding blocks the build, with no warning beforehand. Proven in
 `fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs`.
2. **The renewal warning gate** (`needsRenewal`, lane R23 item 4, 2026-10-02): fires starting
 `WARNING_WINDOW_DAYS` (7) before the expiry date and FAILS the standing test `STANDING GATE, real
 clock, real baseline.json` in the same file, unless the baseline has been re-measured (its
 `writtenAt` field moved to on-or-after the window's own start) since the window opened. This gate
 exists so a renewal decision is forced ahead of the cliff, not discovered on the day everything goes
 red at once.

Both gates run in the existing `node --test` glob `run-test-suite.sh` already covers
(`.discipline/rendering/*.test.mjs`), so both fire in CI and in pre-push step 3 with no separate wiring.

## When the renewal warning fires (only once BUILD_MODE is false)

`node --test fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs` fails on the "STANDING GATE"
test, naming today's date, the expiry date, and the window's own start date. Pick ONE of the two paths
below.

### Path A -- re-run the guard and commit whatever it still finds (the usual path)

The mechanical act of renewal: re-measure, don't just wait.

```
node fsi-app/.discipline/rendering/layout-guard/run-layout-guard.mjs --write-baseline
```

This overwrites `baseline.json`, including its `writtenAt` field (set to the run's own date) -- the
field `needsRenewal` reads to decide whether a renewal happened. Commit the result:

- If the finding count SHRANK (parts were fixed since the last baseline), the shrink is the proof; the
 baseline may only shrink, never grow (`baseline.mjs`'s own header) -- a GROWN count means something new
 regressed and must be fixed before writing the baseline, not baselined away.
- If the finding count is UNCHANGED, committing the refreshed `writtenAt` alone is still a valid
 renewal: it re-affirms the debt is known and still owned, which is the act this gate exists to force.

The renewal warning gate goes green immediately (today's `writtenAt` is on-or-after any window start
for the foreseeable future) and stays green until the warning window opens again before whatever expiry
date is now in force.

### Path B -- get a new operator ruling extending the expiry date

When the findings are not yet ready to clear and no fresh measurement is warranted, get an operator
ruling naming a new expiry date (the same way the 2026-09-09 ruling extended it to 2026-10-15 -- see
`baseline.mjs`'s own header comment, which quotes that ruling verbatim and must be updated to quote the
new one). Then, in the SAME change:

1. Update `BASELINE_EXPIRY_DATE` in `fsi-app/.discipline/rendering/layout-guard/baseline.mjs`.
2. Update `expiryDate` in `fsi-app/.discipline/rendering/layout-guard/baseline.json` to the SAME value
 (`layout-guard-expiry.test.mjs`'s own test asserts the file and the module agree).
3. Quote the new ruling, dated and attributed, in `baseline.mjs`'s own doc comment, the same way the
 existing one is quoted -- never silently replace the old ruling's text, since CLAUDE.md rule 10 makes
 an undated change here a landmine for the next renewal.

A ruling that only pushes the expiry date out does NOT, by itself, move `writtenAt` -- `needsRenewal`'s
renewal signal is specifically "the guard was re-run," not "the deadline moved." If the new expiry date
is itself more than `WARNING_WINDOW_DAYS` away, the warning gate goes green on the date-comparison alone
(the window has not opened relative to the new date); if a ruling is granted WHILE already inside the
old window, also run Path A's `--write-baseline` in the same change so `writtenAt` is current against
the new date too -- the two paths are not mutually exclusive.

## Renewal by workflow

Lanes cannot run a browser, so Path A's command is run by a workflow instead:
`.github/workflows/layout-baseline-renewal.yml` (dispatch only, no schedule, `contents: read`, commits
nothing). It uses the rendering-guard job's setup on ubuntu, the same oracle the required gate measures
on, and runs `run-layout-guard.mjs --write-baseline` over the full route and width set.

1. Dispatch it on or after the window start (`warningWindowStart()`, 2026-10-08 for the current expiry)
 and before the expiry date. A regeneration BEFORE the window start does not satisfy the gate:
 `needsRenewal` compares the file's `writtenAt` (the UTC date of the run) with the window start as
 strings, so a baseline written on 2026-10-04 still fails the standing gate from 2026-10-08.
2. The run fails, and uploads nothing, if any route hit a harness error (the baseline would be partial)
 or if the finding count grew past the committed baseline's. A grown count is a regression to fix, not
 to baseline.
3. Download the artifact `layout-baseline-<run id>` (kept 7 days). It holds three files under their
 repo paths: `fsi-app/.discipline/rendering/layout-guard/baseline.json`, `.../results.json` and
 `docs/audits/layout-guard-2026-09-08.md`.
4. In a coordinator docs lane, commit those three files over the existing ones, with named-file staging.
 The expiry test now takes a ceiling (the count may be at most 792) and requires the `count` field to
 equal the number of keys in the file, so a shrunk baseline needs no test edit.
5. Confirm the standing gate passes: `node --test fsi-app/.discipline/rendering/layout-guard-expiry.test.mjs`.

## Owning part list

The baseline's dated routing table -- which part owns each surviving finding -- lives at
`docs/audits/layout-guard-2026-09-08.md`. A renewal that clears findings should also narrow or retire
that table's entries for the parts just fixed, in the same change (memory conventions: an owning
doc is kept honest at the moment the thing it tracks changes, not swept later).

## Cross-references

- [layout-guard-2026-09-08](../audits/layout-guard-2026-09-08.md) -- the guard's first full run and the
 owning-part routing table this renewal procedure keeps current.
- [rendering-guard-local-vs-ci-2026-09-12](../audits/rendering-guard-local-vs-ci-2026-09-12.md) -- a
 separate, already-investigated local-vs-CI divergence in the same guard; not a renewal concern, cited
 here only so the two "layout guard went red" causes are not conflated.
