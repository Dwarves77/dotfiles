// Panel 21c acceptance detector (lane w10-factcard-d, 2026-09-21, build item 6). Pure core: takes
// a plain measurements object (computed from the real mounted DOM by
// .discipline/rendering/smoke/panel-21c-smoke.mjs, a Playwright-driven spec this sandbox cannot
// run, "Playwright is not installed here by operator ruling") and judges it against the
// operator's own acceptance list (2026-09-21 review, verbatim):
//
//   - fixture = panel 21c, same content, <= 1100px total height for both groups
//   - every card <= 140px unless the claim exceeds 4 lines
//   - 0 external captions above cards; 0 empty 132px columns
//   - 0 adjacent cards of the same kind
//   - each group has band pill + ACTION strip
//
// Proven red-then-green in panel21c-accept.test.mjs (the no-npm suite), same pattern
// ux-assert.test.mjs uses for its own pure core.

/**
 * @param {{
 *   groupsTotalHeight: number,
 *   groups: Array<{
 *     hasBandPill: boolean,
 *     hasActionStrip: boolean,
 *     cards: Array<{
 *       kindSlug: string,
 *       heightPx: number,
 *       claimLineCount: number,
 *       hasLeadColumn: boolean,   // true when the body grid reserves the 132px lead track
 *       hasFigureLead: boolean,   // true when a non-empty lead element actually rendered
 *       captionAboveCard: boolean, // true when a text node/element sits above the card, inside
 *                                   // the group body, that is not the group's own header
 *     }>,
 *   }>,
 * }} m
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkPanel21cAcceptance(m) {
  const violations = [];

  if (typeof m.groupsTotalHeight !== "number") {
    violations.push("groupsTotalHeight missing or not a number");
  } else if (m.groupsTotalHeight > 1100) {
    violations.push(`both groups together are ${m.groupsTotalHeight}px tall, exceeds the 1100px acceptance ceiling`);
  }

  if (!Array.isArray(m.groups) || m.groups.length === 0) {
    violations.push("no groups measured");
    return { ok: false, violations };
  }

  for (const [gi, g] of m.groups.entries()) {
    if (!g.hasBandPill) violations.push(`group ${gi}: no band pill`);
    if (!g.hasActionStrip) violations.push(`group ${gi}: no ACTION strip`);

    let prevKind = null;
    for (const [ci, c] of (g.cards ?? []).entries()) {
      if (c.captionAboveCard) {
        violations.push(`group ${gi} card ${ci}: an external caption renders above the card`);
      }
      if (c.hasLeadColumn && !c.hasFigureLead) {
        violations.push(`group ${gi} card ${ci}: reserves the 132px lead column with no figure lead rendered`);
      }
      if (c.heightPx > 140 && c.claimLineCount <= 4) {
        violations.push(`group ${gi} card ${ci}: ${c.heightPx}px tall (> 140px) with a claim of only ${c.claimLineCount} line(s)`);
      }
      if (prevKind !== null && c.kindSlug === prevKind) {
        violations.push(`group ${gi} card ${ci}: same kind ("${c.kindSlug}") as the previous card, adjacent`);
      }
      prevKind = c.kindSlug;
    }
  }

  return { ok: violations.length === 0, violations };
}
