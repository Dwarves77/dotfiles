// pulse-shared.mjs — pure helpers shared by the Dashboard's five-surface pulse cards (Lane DASH,
// 2026-09-02). PLAIN ESM, ZERO DEPENDENCIES, so a `node --test` proof can exercise the sort/format/
// map logic without tsc, a bundler, or a database (mirrors src/lib/surface-of.mjs's own constraint).
//
// Kept separate from the .tsx components so the ranking rule (priority band, then most-recent) has
// one home instead of being re-typed identically in MarketIntelPulse / ResearchPulse /
// OperationsPulse — the "no duplication of an existing module" rule applied within this lane's own
// new files, not just against the rest of the codebase.

export const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

/**
 * Sort a resource-shaped array by priority band (CRITICAL first), tiebroken by most-recent `added`
 * date. Never mutates the input. An unrecognized/missing priority ranks last (rank 4) rather than
 * throwing or silently sorting first.
 *
 * Generic (element type is whatever was passed in, typically `Resource[]`) so a TS caller's
 * `.map((r) => ...)` on the result gets a real type for `r` instead of implicit `any` — this file
 * has no companion `.d.ts` and `allowJs` (not `checkJs`) is the repo's convention for `.mjs`
 * consumption (matches src/lib/surface-of.mjs), so the JSDoc tags below ARE the type contract.
 *
 * @template T
 * @param {T[]} resources
 * @returns {T[]}
 */
export function rankByPriorityThenRecency(resources) {
  return (resources || []).slice().sort((a, b) => {
    const pa = PRIORITY_RANK[a?.priority] ?? 4;
    const pb = PRIORITY_RANK[b?.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    const ta = a?.added ? new Date(a.added).getTime() : 0;
    const tb = b?.added ? new Date(b.added).getTime() : 0;
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    return nb - na;
  });
}

/** "12 Aug"-style short date, UTC (matches ResearchLedger's own formatShortDate convention). Empty
 *  string for a missing/invalid date so callers can `.filter(Boolean)` it out of a meta line rather
 *  than rendering an empty date fragment. */
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
