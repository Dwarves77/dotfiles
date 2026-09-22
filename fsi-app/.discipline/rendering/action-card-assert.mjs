// action-card-assert.mjs, lane W10-ActionCard-a, 2026-09-21. PURE detector core for the
// ActionCard/Timeline/SectionIndex acceptance criteria (brief step 7), npm-free, consumed by BOTH
// the browser-based smoke specs (action-card-smoke.mjs, section-index-smoke.mjs, which collect the
// plain-data shapes below from the real DOM) and action-card-assert.test.mjs (the red-then-green
// proof, no Playwright). Same posture as ux-assert.mjs: one detector core, two callers.

/** EXPOSURE cells over the 3-line clamp. Input: [{ lines, text }]. Pure. */
export function detectClampedOverflow(cells, maxLines = 3) {
  if (!Array.isArray(cells)) return [];
  return cells.filter((c) => Number(c.lines) > maxLines);
}

/** Timeline dots with an empty (or whitespace-only) visible label. Input: string[]. Pure. */
export function detectEmptyDotLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.filter((l) => String(l ?? '').trim().length === 0);
}

/** SectionIndex tab labels whose rendered box cannot hold their own text (scrollWidth > clientWidth,
 *  1px tolerance for sub-pixel layout). Input: [{ text, scrollWidth, clientWidth }]. Pure. */
export function detectTruncatedLabels(labels, tolerance = 1) {
  if (!Array.isArray(labels)) return [];
  return labels.filter((l) => Number(l.scrollWidth) > Number(l.clientWidth) + tolerance);
}

/** The Summary|Full brief depth switch rendered as a standalone row rather than inside the
 *  section-index nav. Input: [{ isChildOfNav }]. Pure. */
export function detectStandaloneSwitch(switchGroups) {
  if (!Array.isArray(switchGroups)) return [];
  return switchGroups.filter((g) => !g.isChildOfNav);
}

/** ActionCard's own "one card" acceptance: exactly one `[data-part="action-card"]` in the mounted
 *  tree. Returns a violation string, or null when the count is exactly 1. Pure. */
export function detectCardCountViolation(count) {
  if (count === 1) return null;
  return `expected exactly 1 [data-part="action-card"], found ${count}`;
}
