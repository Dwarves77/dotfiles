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
export function detectBoundsViolations(containerRect, cells, tolerance = BOUNDS_TOLERANCE_PX, options = {}) {
  const violations = [];
  const live = (cells || []).filter((c) => c.rect.width > 0 && c.rect.height > 0);
  for (const c of live) {
    if (cellExceedsContainer(c.rect, containerRect, tolerance)) {
      violations.push(`${c.name} extends outside its container`);
    }
  }
  // `containmentOnly` (lane map60, 2026-09-08): check containment but NOT sibling overlap. The one
  // case that needs it is a set of items whose positions are DATA, not layout, map markers sit at
  // their jurisdictions' centroids, so two geographically close jurisdictions (EU and UK at world
  // zoom) overlap by geography and the artboard itself draws two markers all but touching. Every
  // grid/table caller leaves this unset and keeps both halves; it is not a general relaxation.
  if (options.containmentOnly) return violations;
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

// ── 6. Unseparated-thousands detector (opsclip, train 61, defect 4) ────────────
// The production defect this exists to catch: train 59 gave the four band tiles a thousands
// separator and nothing else, so ONE /regulations screen rendered "1,317 regulations · grouped by
// band" and, thirty pixels below it, "1317 regulations tracked across 32 jurisdictions", plus
// "showing 5 of 1031", "All 1031 monitor" and the tiles' own aria-labels reading "1135 items".
// A reader cannot tell whether two differently-formatted numbers are the same number.
//
// The rule this encodes: a rendered INTEGER of four or more digits carries the locale-pinned
// separator (src/lib/format.ts formatNumber, F36). It is a text-level check because that is the
// only level at which the defect is visible; a source-level check cannot see aria-labels built by
// template literal, which is exactly the half train 59's fix missed.
//
// What is deliberately NOT a violation, each because it is not a count:
//   - a four-digit YEAR (1500-2199) standing alone, or inside an ISO date/time;
//   - a digit run touching a letter, `-`, `/`, `:`, `.`, `_` or `#` (identifiers, slugs, hashes,
//     ISO dates, decimals, version strings, "T1", ratios) — a count is a bare numeral;
//   - anything the caller discloses in `known`.
// The year carve-out means a COUNT that happens to equal 2026 slips through. That is a known,
// bounded hole (one value in a thousand), taken deliberately over the alternative of failing every
// date on every surface.
const THOUSANDS_TOKEN = /(?<![\w,.\-/:#])\d{4,}(?![\w,.\-/:#])/g;
const YEAR_LIKE = /^(1[5-9]\d\d|20\d\d|21\d\d)$/;

/** Given rendered text strings, return the ones carrying an unseparated integer >= 1000.
 *  Pure: no DOM. Empty array = clean. */
export function findUnseparatedThousands(texts, known = []) {
  if (!Array.isArray(texts)) return [];
  const knownSet = new Set(known);
  const hits = [];
  for (const t of texts) {
    if (typeof t !== "string" || knownSet.has(t)) continue;
    const matches = t.match(THOUSANDS_TOKEN);
    if (!matches) continue;
    if (matches.every((m) => YEAR_LIKE.test(m))) continue;
    hits.push(t);
  }
  return hits;
}
