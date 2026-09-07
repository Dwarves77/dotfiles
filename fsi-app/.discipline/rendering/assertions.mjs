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

// ── 4. Cell-bounds detector (D1 class, 2026-09-07) ─────────────────────────────
// `detectOverflows` above only catches a CONTAINER's own scrollWidth exceeding its clientWidth —
// the whole-page/whole-card horizontal-scroll case. It never catches a grid cell's content box
// bleeding into a SIBLING cell while the container itself stays perfectly scroll-free (the actual
// D1 defect: the impact column's "UNSCORED" reason ran past its 88px column into the DUE column's
// dates — the card never gained a horizontal scrollbar, so `detectOverflows` was structurally blind
// to it). This detector operates on plain rect objects (`{name, rect:{left,top,right,bottom,width,
// height}}`, i.e. `DOMRect`-shaped but framework-free) so it is pure and portable — the caller (a
// Playwright `page.evaluate`) does the actual `getBoundingClientRect()` collection; this file never
// touches a DOM.

const BOUNDS_TOLERANCE_PX = 1; // sub-pixel rounding slack, same posture as OVERFLOW_TOLERANCE_PX

/** True when a cell's box extends outside its container box by more than the tolerance. */
export function cellExceedsContainer(cellRect, containerRect, tolerance = BOUNDS_TOLERANCE_PX) {
  return (
    cellRect.right - containerRect.right > tolerance ||
    containerRect.left - cellRect.left > tolerance ||
    cellRect.bottom - containerRect.bottom > tolerance ||
    containerRect.top - cellRect.top > tolerance
  );
}

/** True when two rects share more than a sliver of area (both axes overlap beyond tolerance) —
 *  i.e. one cell's content visually collides with another's, not just a shared 1px border. */
export function rectsOverlap(a, b, tolerance = BOUNDS_TOLERANCE_PX) {
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return overlapX > tolerance && overlapY > tolerance;
}

/**
 * Given one container's rect and its cell rects (siblings meant to sit in their own column/box,
 * never overlapping and never spilling past the container), return human-readable violation
 * strings. Empty = clean. Zero-size rects (a cell that rendered nothing, e.g. an empty overflow
 * slot) are skipped — they cannot overflow or overlap by definition.
 * @param {{left:number,top:number,right:number,bottom:number}} containerRect
 * @param {{name:string, rect:{left:number,top:number,right:number,bottom:number,width:number,height:number}}[]} cells
 */
export function detectBoundsViolations(containerRect, cells, tolerance = BOUNDS_TOLERANCE_PX) {
  const violations = [];
  const live = (cells || []).filter((c) => c.rect.width > 0 && c.rect.height > 0);
  for (const c of live) {
    if (cellExceedsContainer(c.rect, containerRect, tolerance)) {
      violations.push(`${c.name} extends outside its container`);
    }
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (rectsOverlap(live[i].rect, live[j].rect, tolerance)) {
        violations.push(`${live[i].name} overlaps ${live[j].name}`);
      }
    }
  }
  return violations;
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
