// rendering-guard assertions — the PURE detector core for the overflow + placeholder-literal +
// hydration rendering guard (RENDER-1, 2026-07-11). GOVERNING skill: caros-ledge-platform-intent
// (customer-surface fidelity) + sprint-followups-discipline (RD-5 build-catchable-class spirit).
//
// These functions are pure (node builtins only + the two REAL app modules whose invariants they
// enforce). They are consumed by BOTH:
//   1. assertions.test.mjs — runs in the no-npm `node --test` discipline suite (portable), the
//      red-then-green proof that each detector fires on a defect and passes on the fix; and
//   2. run-rendering-guard.mjs — the Playwright browser runner that renders fixtures at every
//      viewport, measures REAL layout (scrollWidth/clientWidth — impossible in jsdom), and feeds
//      the measurements/texts to these same detectors.
// One detector core, two callers: the browser run cannot disagree with the unit proof.

// Reuse the F-1 SoT predicate + literal set (never a hand-duplicated copy that could drift).
import { isPlaceholderText, HEADER_LITERALS } from "../../src/lib/agent/source-entry-filter.mjs";

// ── 1. Horizontal-overflow detector ────────────────────────────────────────────
// A container overflows horizontally when its scrollWidth exceeds its clientWidth by more than a
// sub-pixel tolerance. `.leaflet-container` is EXCLUDED by contract (it pans internally by design —
// a known false positive); the caller must not hand a leaflet node here, but we also guard by name.

export const OVERFLOW_TOLERANCE_PX = 1; // sub-pixel rounding slack

/** True when a single measurement overflows horizontally. */
export function isHorizontalOverflow({ scrollWidth, clientWidth }, tolerance = OVERFLOW_TOLERANCE_PX) {
  return Number(scrollWidth) > Number(clientWidth) + tolerance;
}

/**
 * Filter a list of container measurements down to the ones that overflow.
 * @param {{name:string,scrollWidth:number,clientWidth:number,className?:string}[]} measurements
 * @returns the overflowing entries, each annotated with `overflowBy` (px).
 */
export function detectOverflows(measurements, tolerance = OVERFLOW_TOLERANCE_PX) {
  if (!Array.isArray(measurements)) return [];
  return measurements
    .filter((m) => m && !/leaflet-container/.test(String(m.className ?? "")))
    .filter((m) => isHorizontalOverflow(m, tolerance))
    .map((m) => ({ ...m, overflowBy: Number(m.scrollWidth) - Number(m.clientWidth) }));
}

// ── 2. Placeholder-literal detector (F-1 class) ────────────────────────────────
// No F-1 header-literal ("Source Name", "Tier estimate", "URL", "Why this source matters", …) may
// render as visible DATA content. Reuses isPlaceholderText (the parse→render trust predicate) so
// this guard and the parser/renderer share ONE definition of "placeholder/header artifact".

/** The exact literal strings the browser scanner searches rendered rows for (from the SoT set). */
export const PLACEHOLDER_LITERALS = Object.freeze([...HEADER_LITERALS]);

/** Given the visible text of rendered row key-cells, return those that are placeholder/header
 *  literals (i.e. fabricated/echoed content that must never reach the customer). Empty = clean. */
export function findPlaceholderLiterals(texts) {
  if (!Array.isArray(texts)) return [];
  return texts.filter((t) => isPlaceholderText(t));
}

// ── 3. Hydration-agreement detector (V-07 class) ───────────────────────────────
// The V-07 invariant: the label used for the SERVER render AND the FIRST client render must be
// deterministic and independent of Date.now(), so server HTML === first client render (no React
// #418/#423 mismatch). We prove it two ways.

/** Direct agreement: the server-render text and the first-client-render text must be identical. */
export function hydrationAgrees(serverText, clientFirstText) {
  return serverText === clientFirstText;
}

/**
 * Property test: is `formatFn(iso)` independent of Date.now()? Evaluates the formatter with
 * Date.now stubbed to two far-apart instants (spanning minutes/hours/days) and reports whether the
 * output is identical. A now-independent formatter (stableDateLabel) → true (safe for initial
 * render); a now-dependent one (relativeTimeLabel) → false (the pre-fix hydration bug).
 * Restores the real Date.now in a finally, even if formatFn throws.
 */
export function isNowIndependent(formatFn, iso) {
  const realNow = Date.now;
  try {
    const outputs = new Set();
    // Two instants ~2 days apart so any minute/hour/day-bucketed relative label differs.
    for (const fixedNow of [1_000_000_000_000, 1_000_000_000_000 + 2 * 86_400_000]) {
      Date.now = () => fixedNow;
      outputs.add(formatFn(iso));
    }
    return outputs.size === 1;
  } finally {
    Date.now = realNow;
  }
}
