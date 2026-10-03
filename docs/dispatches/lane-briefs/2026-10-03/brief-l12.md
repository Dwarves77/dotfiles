# Lane L12: Carbon-cost-per-FEU rendering, detail page (verification only)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.2 (row 02S6 row 3) and its L12 entry in section 2;
`docs/specs/02-market-intel.md` section 6 item 3; `docs/plans/finish-plan-2026-09-02.md`'s Wave 2 "CORR"
lane paragraph; then the README for this dispatch, especially "What is already built" items 2 and 3.

Lane id: `l12`. Branch: cut from `origin/master`. Branch name: `lane/l12-carbon-cost-verify-2026-10-03`.
Model: Sonnet.

## Objective and requirement IDs

Spec 02S6 row 3, the differentiator the plan calls "built-and-proven [AUDITED]" with one named gap: the
raw-dump bug (CF-BROKEN-6) affecting record-grade item rendering on the Market detail page, fixed on
`lane/w2d-market-detail-dump` but "not merged" at the plan's own drafting time. The README's "What is
already built" items 2-3 establish [CONFIRMED] that (a) the detail page (`MarketSignalDetailSurface.tsx`)
already renders its own carbon-cost-per-FEU figure via `carbon-overlay-view.mjs`, independent of the
ledger-page `CarbonCostOverlay` block, and (b) PR #882 (the w2d fix) is merged to `origin/master`. This
lane's objective is to prove the figure renders correctly end to end on a live record-grade item now that
the fix is merged - a verification, not new construction.

## Operator rulings that bind you

- **CLAUDE.md rule 14**: convert the plan's "built-and-proven, gap: fix not yet merged" to a fresh,
  dated confirmation now that the gap's own precondition (the merge) is satisfied - do not just repeat
  the plan's wording.
- **CLAUDE.md rule 2** (never fabricate): if the live figure does not render with a full envelope
  (derivation, as-of, basis), report exactly what is missing, do not describe it as working.

## Exact write set

- No production code change anticipated. If your live check finds the raw-dump defect (or a variant of
  it) still present despite the merge, STOP and report the exact reproduction (item id, rendered output)
  rather than fixing it yourself - that would be new construction outside this lane's declared scope.
- `docs/ops/session-log.d/2026-10-03-l12.md` (new).

## READ FIRST

1. `fsi-app/src/lib/market/carbon-overlay-view.mjs`, IN FULL - `buildCarbonOverlayView()`'s contract:
   what it returns for `state: "resolved"` vs any gap state, and whether the envelope (derivation, as-of,
   basis) is present in that return shape or only in the `CarbonCostOverlay.tsx` ledger-page path.
2. `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` lines 280-505, IN FULL for that range -
   the exact render block, confirmed against the README's line citations.
3. `fsi-app/src/components/market/CarbonCostOverlay.tsx`, IN FULL - the sibling ledger-page component,
   to confirm your understanding of the "two render paths, same spec row" shape stated in the README is
   correct and not a misreading.
4. `git log --oneline -- fsi-app/src/app/market/page.tsx fsi-app/src/components/pages/
   MarketSignalDetailSurface.tsx` since the w2d PR - confirm what the merge actually changed on these
   two files, name the commit(s).
5. The record-grade item the raw-dump bug (CF-BROKEN-6) was originally reported against (search
   `docs/audits/` and `docs/ops/` for "CF-BROKEN-6" or "raw-dump" to find the original item id/repro) -
   re-test against that same item if it still exists live, not an arbitrary substitute.
6. `fsi-app/src/lib/figures/format-range.mjs` - the shared range renderer both carbon-cost paths use per
   `CarbonCostOverlay.tsx`'s own header; confirm the detail-page path also uses it (or state if it does
   not, as a genuine finding, not an assumption).

Report "read and reused" naming each file above.

## Migration number

None requested; none needed.

## Harness and flywheel wiring (rule 17: nothing runs alone)

This figure is read-time, computed from `carbonFactors` and `jurisdictionIso` already assembled by the
page (per `CarbonCostOverlay.tsx`'s own header: "Server component, NO FETCH HERE"); there is no harness
family for this verification. State this explicitly.

## R14 compliance

No data-population run, no `--apply` path, no live DB write beyond what the page's existing server-side
read already does.

## Tests, and the fire-once requirement

- Run the existing test suite for the two files you read (`grep -l` their basenames under
  `fsi-app/src/**/*.test.*` first; run whatever exists).
- "Test what you build": open the live `/market/[corridor-slug]` detail route (or the existing Playwright
  smoke if one already covers this surface) for the specific record-grade item named in READ FIRST item
  5, or any live item with a resolvable carbon-cost-per-FEU figure if that exact item no longer exists,
  and paste the rendered value, unit and body text verbatim - not a paraphrase.

## UX compliance

Not applicable for this lane's own write set (no `.tsx`/`.css` change); if your verification finds a
genuine UX defect, name it precisely in "open items" rather than fixing it under this brief's scope.

## Dependencies

L0 (the Wave-1 merge, satisfied - PR #882 confirmed merged). Independent of L10 and L11.

## Report format

Per the lane common contract. State the exact rendered figure (value, unit, derivation/as-of/basis if
present), the item id you tested against, whether it matches the README's claim, and any discrepancy
found.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential, no live write.
