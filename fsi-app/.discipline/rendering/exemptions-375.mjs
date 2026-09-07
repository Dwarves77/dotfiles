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
// pages' 375 checks, exactly as if this file did not exist. The other stated trigger ("or once a
// 390 fixture exists for that page, whichever first") is not separately mechanized here; landing a
// real 390 fixture for a page is the cue to delete that page's entry in the same commit.
//
// Six entries: the five list surfaces the ruling names (README screens #2/#4/#6/#8/#11 — Regulations
// list, Market list, Research list, Operations list, Watchlist; dashboard is explicitly NOT a list
// page and carries no entry) plus /map, which the ruling does not name — the coordinator extended
// the same dated shape to it (fold report: "map-page:populated@375 (2 failures: overflow and
// clipped elements) failing for the same cause") pending the operator's own confirmation; that
// entry's `reason` and the matching DEVIATION-LOG row both say so, and it is removed at assembly if
// the answer comes back no.
//
// `fixturePrefix` is the label prefix run-rendering-guard.mjs's failure strings actually carry
// today (UX_SMOKE_SPECS registry names / runUxSpec `spec.name` values) — confirmed 2026-09-07 by
// running the guard on the pre-existing train/wave55 base and reading its own failure output
// verbatim, not guessed from the page route. `watchlist`'s entry has NO fixture prefix carrying UX
// 375 coverage today (watchlist-team-smoke.mjs is an SM spec, not a UX_SMOKE_SPECS entry, and
// measures no viewport) — the entry is a documented no-op until a UX spec is added for it; it
// suppresses nothing today because nothing there fails today, and is kept so the pending-item list
// stays five-list-pages-plus-map complete per the ruling rather than four-plus-map.
export const RENDERING_375_EXEMPTIONS = [
  {
    page: "regulations-list",
    fixturePrefix: "regulations-ledger",
    reason: "mobile 390 artboards pending (Claude Design, queued 2026-09-07)",
    dated: "2026-09-07",
    expiryWave: 58,
  },
  {
    page: "market-list",
    fixturePrefix: "market-rows",
    reason: "mobile 390 artboards pending (Claude Design, queued 2026-09-07)",
    dated: "2026-09-07",
    expiryWave: 58,
  },
  {
    page: "research-list",
    fixturePrefix: "research-rows",
    reason: "mobile 390 artboards pending (Claude Design, queued 2026-09-07)",
    dated: "2026-09-07",
    expiryWave: 58,
  },
  {
    page: "operations-list",
    fixturePrefix: "operations-ledger",
    reason: "mobile 390 artboards pending (Claude Design, queued 2026-09-07)",
    dated: "2026-09-07",
    expiryWave: 58,
  },
  {
    page: "watchlist",
    fixturePrefix: "watchlist",
    reason: "mobile 390 artboards pending (Claude Design, queued 2026-09-07); no-op today, no UX_SMOKE_SPECS 375 coverage exists yet for this page",
    dated: "2026-09-07",
    expiryWave: 58,
  },
  {
    page: "map",
    fixturePrefix: "map-page",
    reason:
      "coordinator-extended, operator confirmation pending (not named by the operator's ruling, same cause and shape as the five list pages); mobile 390 artboards pending (Claude Design, queued 2026-09-07)",
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
