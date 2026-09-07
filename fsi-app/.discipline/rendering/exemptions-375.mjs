// 375px per-page exemptions (lane uiactions, 2026-09-07, addendum item 8).
//
// Operator ruling (verbatim, 2026-09-07): "Don't invent mobile behaviour in the codebase, that's
// the same drift mechanism, just entering from CI instead of from a page migration. Mark the five
// list pages desktop-only at 375, recorded as a pending item against the mobile artboards. One
// condition: the exemption is per-page and dated, not a global guard relaxation, so it fails again
// the moment the 390 artboards land and aren't implemented."
//
// This is NOT a global 375 relaxation: run-rendering-guard.mjs only suppresses a failure whose
// label starts with one of these `fixturePrefix` values AND carries "@375" — every other page,
// every other viewport, and the law-2 / placeholder / squeezed-title checks on these SAME pages at
// every OTHER viewport still fail the build. Dated the way F25 dates its own allowlist entries
// (docs/plans/complete-system-build-plan-2026-09-04.md §W7.1): each entry names a `expiryWave`
// (train/wave number) and the guard reads the same `latestTrainWave()` oracle F25 uses — once the
// landed history reaches that wave, the entry no longer applies and the guard FAILS again on these
// pages' 375 checks, exactly as if this file did not exist.
//
// FOLD-56 (2026-09-07): `market-list`, `research-list` and `operations-list` are REMOVED. Lane
// moblist's mobile-390 build cleared `regulations-list` and `watchlist` (nothing they covered still
// failed); the remaining three failed for a narrower reason — MarketIntelLedger.tsx,
// ResearchLedger.tsx and OperationsLedger.tsx each passed a raw WatchButton (64x28 / 75x32) directly
// into ListRow's 44x44 overflow cell, clipping its neighbour at 375px — not RegulationsLedger's
// shape, which already wraps its WatchButton in PriorityDropdown's "..." kebab. FOLD-56 gives the
// three ledgers the same PriorityDropdown kebab wrapper (`showPriorityActions={false}`, a new prop
// on the SAME component, not a copy — see PriorityDropdown.tsx's header), re-ran the rendering guard,
// confirmed PASS at 375px with no exemptions firing, and removed the three entries here in the same
// change per this file's own header ("landing a real 390 fixture for a page is the cue to delete
// that page's entry in the same commit").
//
// One entry remains: `map`. Operator ruling 2026-09-07 (second set, item 2): "exemption confirmed,
// expires wave 58. Remove 'operator confirmation pending'. No mobile map spec exists and none
// should be invented." — this entry's `reason` reflects that ruling verbatim; it is not a
// coordinator extension pending confirmation any more.
//
// `fixturePrefix` is the label prefix run-rendering-guard.mjs's failure strings actually carry
// today (UX_SMOKE_SPECS registry names / runUxSpec `spec.name` values) — confirmed by running the
// guard and reading its own failure output verbatim, not guessed from the page route.
export const RENDERING_375_EXEMPTIONS = [
  {
    page: "map",
    fixturePrefix: "map-page",
    reason:
      "operator ruling 2026-09-07: exemption confirmed, no mobile map spec exists and none is to be invented; expires wave 58",
    dated: "2026-09-07",
    expiryWave: 58,
  },
];

/** True when a rendering-guard failure string is covered by a still-active entry above. */
export function isExempt375(failureLine, activeExemptions) {
  if (!failureLine.includes("@375")) return false;
  return activeExemptions.some((e) => failureLine.startsWith(`${e.fixturePrefix}:`));
}

/** Entries whose expiryWave has not yet been reached (or whose wave is unknown — best-effort, same
 *  posture as F25's own shallow-checkout degradation, see latestTrainWave's header). */
export function activeExemptions(list, latestWave) {
  return list.filter((e) => latestWave === null || latestWave < e.expiryWave);
}
