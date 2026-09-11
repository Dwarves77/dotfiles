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
// MOBILE-60 (2026-09-08), measured, not assumed. `latestTrainWave()` now reads 58, so
// `activeExemptions()` returns EMPTY: the one remaining entry no longer applies, and the rendering
// guard was run this lane with it inactive and PASSED — /map clears the 375 checks on its own, with
// nothing suppressed. The entry is kept rather than deleted because it is the record of the
// operator's ruling and of the wave it expired at (deleting it would erase both), and because the
// mechanism around it is live: a future page that needs a dated per-page exemption adds it here.
// The five list pages' entries are already gone (FOLD-56 + lane moblist); this lane's own 390 specs
// are the standing measurement that keeps them from coming back, per the operator's condition
// ("it fails again the moment the 390 artboards land and are not implemented").
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

/**
 * Entries whose expiryWave has not yet been reached. FAILS CLOSED on an unknown wave: with no live
 * wave number to test an expiry against, no entry can be shown to still be inside its window, so
 * none are treated as active.
 *
 * CORRECTED (coordinator review, 2026-09-11, task 0.1 follow-up round 2, [CONFIRMED by the
 * reviewer], remediation-discipline section 2, class over instance). The sibling
 * `exemptions-law2-desktop.mjs`'s `activeLaw2Exemptions` carried the identical fail-open shape and
 * was fixed in commit 2730ad23 after it was named as the exact mechanism behind the
 * push-vs-pull_request layout-guard divergence task 0.1 investigated: a depth-1 pull_request
 * checkout cannot resolve `origin/master`, so `latestTrainWave()` returns null, and the previous
 * form here ("or whose wave is unknown - best-effort, same posture as F25's own shallow-checkout
 * degradation") would have let that checkout keep suppressing an `@375` finding a depth-1 push
 * checkout, resolving a real and expired wave on the SAME tree, correctly reports. Never throwing on
 * a null wave is still correct (a missing history must not crash the guard); treating null as ACTIVE
 * is not - a guard's default under uncertainty is closed, not open.
 */
export function activeExemptions(list, latestWave) {
  if (latestWave === null && list.length > 0) {
    console.warn(
      "exemptions-375: latestTrainWave() returned null (no origin/master ref and no waveNN token on " +
      "HEAD reachable from this checkout) - treating every dated exemption as EXPIRED, fail closed, " +
      "not fail open; a shallow checkout is the likely cause, see F25-module-liveness.mjs"
    );
  }
  return list.filter((e) => latestWave !== null && latestWave < e.expiryWave);
}
