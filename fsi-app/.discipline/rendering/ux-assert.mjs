// rendering-guard UX detectors (2026-09-03, coordinator, operator directive "mobile version has compacted
// words on every page or words going off page"). GOVERNING text: docs/design/ux-laws.md (law 2 target
// size, laws 4/12 no overflow, the one-word-per-line wrap class) and invariant RD-60. This module is the
// PURE detector core, npm-free, consumed by BOTH run-rendering-guard.mjs (fixture legs and every
// real-component smoke spec, at every viewport) and ux-assert.test.mjs (the red-then-green proof).
// One detector core, two callers, same posture as assertions.mjs.
//
// Root cause of the 2026-09-03 screenshots [CONFIRMED in MarketIntelLedger.tsx ~L900]: an inline-styled
// flex row with a non-shrinking aside (`flexShrink: 0`, `minWidth: 120`, nowrap figure + "Full analysis"
// link + toggle, ~330 px) beside a `flex: 1; minWidth: 0` title. At 375 px the title got ~40 px and every
// word wrapped onto its own line. No detector measured a title's width against its card, so nothing
// fired. `detectSqueezedTitles` is that detector; `detectSmallTargets` is law 2's floor.

/** Law-2 floor: an interactive target is at least 44 CSS px on its shorter axis ... */
export const TARGET_MIN_PX = 44;
/** ... or at least 24 px with TARGET_CLEARANCE_PX of clear space from every other target. */
export const TARGET_SMALL_MIN_PX = 24;
export const TARGET_CLEARANCE_PX = 8;
/** A wrapped title narrower than this fraction of its container is squeezed (one-word-per-line class). */
export const TITLE_MIN_RATIO = 0.6;

/** The elements the browser collector treats as interactive targets. Exported so the collector and the
 *  test agree on one list. */
export const TARGET_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';

/** Shortest-axis size of a box. */
function shortAxis(b) {
  return Math.min(Number(b.width), Number(b.height));
}

/** Gap between two axis-aligned boxes (0 when they touch or overlap). */
export function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.max(dx, dy);
}

/**
 * Targets below the law-2 floor. Input: [{ name, x, y, width, height }] for every VISIBLE interactive
 * element (the collector drops zero-size and hidden ones). A box passes when its shorter axis is
 * ≥ TARGET_MIN_PX, or ≥ TARGET_SMALL_MIN_PX with ≥ TARGET_CLEARANCE_PX from every other target.
 * Returns the failing boxes annotated with `shortAxis` and `nearest` (px to the closest other target,
 * null when alone). Pure.
 */
export function detectSmallTargets(boxes) {
  if (!Array.isArray(boxes)) return [];
  const out = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (!b) continue;
    const s = shortAxis(b);
    if (s >= TARGET_MIN_PX) continue;
    let nearest = null;
    for (let j = 0; j < boxes.length; j += 1) {
      if (j === i || !boxes[j]) continue;
      const g = boxGap(b, boxes[j]);
      if (nearest === null || g < nearest) nearest = g;
    }
    const clear = nearest === null || nearest >= TARGET_CLEARANCE_PX;
    if (s >= TARGET_SMALL_MIN_PX && clear) continue;
    out.push({ ...b, shortAxis: s, nearest });
  }
  return out;
}

/**
 * Titles that wrapped because they were squeezed, not because they were long. Input:
 * [{ name, width, containerWidth, lines }] where `lines` is the rendered line count (height /
 * line-height, rounded) and `containerWidth` the clientWidth of the nearest [data-guard-container]
 * (or the offset parent). A title on ONE line is never squeezed (short text is fine). A title on two or
 * more lines whose box is narrower than TITLE_MIN_RATIO × container is the defect class. Pure.
 */
export function detectSqueezedTitles(titles, ratio = TITLE_MIN_RATIO) {
  if (!Array.isArray(titles)) return [];
  return titles
    .filter((t) => t && Number(t.lines) >= 2 && Number(t.containerWidth) > 0)
    .filter((t) => Number(t.width) < ratio * Number(t.containerWidth))
    .map((t) => ({ ...t, ratio: Number((Number(t.width) / Number(t.containerWidth)).toFixed(2)) }));
}

/**
 * Human-readable failure strings for one measured page (empty = clean). `targets` and `titles` are the
 * two collector outputs; `label` prefixes each line for the caller's summary. Pure.
 */
export function assertUxClean(label, { targets = [], titles = [] } = {}) {
  const failures = [];
  const small = detectSmallTargets(targets);
  if (small.length > 0) {
    const detail = small
      .slice(0, 8)
      .map((t) => `${t.name} ${Math.round(t.width)}×${Math.round(t.height)}px${t.nearest !== null && t.nearest < TARGET_CLEARANCE_PX ? ` (${Math.round(t.nearest)}px from a neighbour)` : ''}`)
      .join(', ');
    failures.push(
      `${label}: ${small.length} interactive target(s) below the law-2 floor (≥${TARGET_MIN_PX}px, or ≥${TARGET_SMALL_MIN_PX}px with ${TARGET_CLEARANCE_PX}px clearance) — ${detail}${small.length > 8 ? ', …' : ''}`,
    );
  }
  const squeezed = detectSqueezedTitles(titles);
  if (squeezed.length > 0) {
    const detail = squeezed
      .slice(0, 6)
      .map((t) => `${t.name} ${Math.round(t.width)}/${Math.round(t.containerWidth)}px (${t.lines} lines)`)
      .join(', ');
    failures.push(`${label}: ${squeezed.length} title(s) squeezed to <${TITLE_MIN_RATIO * 100}% of their card and wrapping — ${detail}`);
  }
  return failures;
}

/**
 * Browser-side collector. Runs inside a Playwright page and returns `{ targets, titles }` in the shapes
 * the detectors above take. Not pure (DOM), but npm-free: the caller passes the page in.
 * Titles are the elements marked `data-guard-title` (row components carry the attribute on the title
 * element; a lane adding a row adds the attribute) — the container is the nearest
 * `[data-guard-container]`, falling back to the offset parent.
 */
export async function measureUx(page) {
  return page.evaluate(
    ({ selector }) => {
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const nameOf = (el) =>
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24) || el.className || ''}]`;
      const targets = [];
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        targets.push({ name: nameOf(el), x: r.x, y: r.y, width: r.width, height: r.height });
      }
      const titles = [];
      for (const el of document.querySelectorAll('[data-guard-title]')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 16;
        const container = el.closest('[data-guard-container]') || el.offsetParent || document.body;
        titles.push({
          name: nameOf(el),
          width: r.width,
          containerWidth: container.clientWidth,
          lines: Math.max(1, Math.round(r.height / lh)),
        });
      }
      return { targets, titles };
    },
    { selector: TARGET_SELECTOR },
  );
}
