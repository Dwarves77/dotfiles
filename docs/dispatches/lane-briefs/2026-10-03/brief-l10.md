# Lane L10: Market Intel signal/fact chip (verification) + lead-time chart (held)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.2 (row 02S6 row 4-5) and its L10 entry in section 2;
`docs/specs/02-market-intel.md` sections 2, 6, 7 in full; `docs/plans/finish-plan-2026-09-02.md`'s Wave 2
"CORR" lane paragraph; then the README for this dispatch (`docs/dispatches/lane-briefs/2026-10-03/
README.md`) in full, especially "What is already built" item 1 and the "Open question" section - both
bind this brief directly.

Lane id: `l10`. Branch: cut from `origin/master`. Branch name: `lane/l10-market-chip-verify-2026-10-03`.
Model: Sonnet. You execute exactly this brief. Anything it does not cover, or any statement here that is
wrong against the code, is a STOP: report it, do not solve it.

## OPEN QUESTION - read before doing anything else

The lead-time chart half of this lane (spec 02 S6 row 5, SBTi-fed) is HELD pending an operator ruling
on the conflict between `finish-plan-2026-09-02.md`'s "Lead-time chart stays ruled out (no data source)"
and the complete-build-plan's instruction to build it. **Do not build the lead-time chart.** If you reach
this fork in your own reading and find a fact that changes the picture (for example, the ruling has
already been reversed somewhere you find and this brief missed it), STOP and report the fact rather than
building around it. Your write set below covers the chip-verification half only.

## Objective and requirement IDs

Spec 02S6 row 4 ("Unverified" chip, promotion state). The README's "What is already built" item 1
establishes [CONFIRMED] that the named defect (`isSignalType = !!r.type`, unconditional chip) is already
fixed: `fsi-app/src/lib/market/signal-promotion.mjs`'s `derivePromotionState()` is live in `fsi-app/src/
components/pages/MarketSignalDetailSurface.tsx`. This lane's objective is to prove that live, not to
rebuild it: a fresh regression check against a real verified item, a prior-art-complete written
confirmation, and - only if genuinely absent - the UX smoke registration the lane common contract
requires for any row/ledger/card component.

## Operator rulings that bind you

- **CLAUDE.md rule 14** (a finding is a hypothesis until verified): the complete-build-plan's own row for
  this requirement is labelled `[HYPOTHESIS, spec-dated]`. Your job is to convert that to `[CONFIRMED]`
  or `[REFUTED]` against the live tree, not to treat the plan's prose as settled.
- **CLAUDE.md rule 2** (never fabricate): do not write a verification report claiming a live check you
  did not run.
- **README's open question** (this dispatch): the lead-time chart is out of scope for this lane until the
  operator rules. Do not build it, do not stub it, do not partially build it "ahead of the ruling."

## Exact write set

- No production code changes anticipated. If your verification finds the fix is NOT actually live (the
  README's confidence is wrong), STOP and report the contradiction - do not silently fix it yourself
  outside a brief amendment, since that would expand this lane's scope beyond verification.
- `fsi-app/.discipline/rendering/smoke/market-signal-detail-smoke.mjs` (new, ONLY if no existing UX smoke
  spec already covers `MarketSignalDetailSurface.tsx`'s promotion-chip render - check first, see READ
  FIRST item 4) plus its registration line in `ux-smoke-specs.mjs` and `F35`'s `ROW_COMPONENTS` list (one
  line each, per the lane common contract's UX contract section) - report the line, the coordinator adds
  it per that contract's own convention of coordinator-added registry lines.
- `docs/ops/session-log.d/2026-10-03-l10.md` (new).

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. `fsi-app/src/lib/market/signal-promotion.mjs`, IN FULL - the module's own header already documents the
   defect and the fix; confirm its prose against the exported `PROMOTION_STATE` object and
   `derivePromotionState()`'s actual logic (does it in fact gate on `originClass`/`citableAsFact` and
   `independentCiters`, never on corroboration count alone, exactly as documented).
2. `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` lines 55-70 and 245-260 and 400-410, IN
   FULL for those ranges - confirm the import, the `useMemo` call, and the "Status" field render exactly
   as the README states, by line number, in your report.
3. `grep -n "isSignalType" fsi-app/src` - confirm zero hits (the README states this; re-run it yourself,
   do not take the README's word for it).
4. `fsi-app/.discipline/rendering/ux-smoke-specs.mjs` and `fsi-app/.discipline/fitness/functions/F35-*` -
   confirm whether a smoke spec already covers this component (search by component name) before writing
   a new one; a duplicate is a review fail per the lane common contract's prior-art rule.
5. `fsi-app/src/__tests__/market-signal-promotion.test.mjs` - the existing test for this exact module;
   run it, read it, confirm it already asserts the no-regression property your own work would otherwise
   duplicate.
6. `git log --oneline -- fsi-app/src/lib/market/signal-promotion.mjs` - confirm lane SURF's own commit,
   name the commit hash and PR number in your report.

Report "read and reused" naming each file above and what you reused rather than reimplemented.

## Migration number

None requested; none needed (no schema touched).

## Harness and flywheel wiring (rule 17: nothing runs alone)

This lane verifies a pure client-side derivation (`derivePromotionState`), not a standing process; there
is no harness family for it and none is created. State this explicitly in your report so it is not read
as a silent omission.

## R14 compliance

No data-population run, no `--apply` path, no live DB write. $0: no network call, no LLM call.

## Tests, and the fire-once requirement

- `node --test fsi-app/src/__tests__/market-signal-promotion.test.mjs` - paste the pass count.
- If you add the UX smoke spec: `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` with
  the spec temporarily registered in your worktree (per the UX contract's own instructions), paste the
  "UX smoke specs:" line, then revert the registry edit before commit exactly as that contract states.
- "Test what you build": open the live `/market/[slug]` route for one verified item in a local dev
  server or the existing Playwright smoke harness and confirm the Status field does not read "Unverified"
  - paste the rendered value, not a description of it.

## UX compliance

Only if you add the smoke spec: state the primary goal (reader sees an honest promotion-state label, not
an inverted one), the path (open the detail page), the one primary action (none - this is a read-only
status field), and that there is no asynchronous action on this element (static render from server data),
per the lane common contract's UX contract section.

## Dependencies

None. Independent of L11 and L12.

## Report format

Per the lane common contract's "Report" section: `git log --oneline origin/master..HEAD`, file-by-file
what was built (likely: nothing beyond the smoke spec, if one was missing, plus the session-log file),
consumers checked (name them), the exact "Status" field value you observed live, whether the UX smoke
spec already existed or was added, and the open-question status (restate that the lead-time chart stays
held). State "the push gate ran clean" or name the exact failing step.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential, no live write. No lead-time-chart code of any
shape, including a stub or a feature-flagged draft.
