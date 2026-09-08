// Desktop law-2 target-floor exemptions, per COMPONENT, dated (lane railfacets, train 62,
// 2026-09-08, operator item C1).
//
// THE CONFLICT, stated with both measurements. Operator item C1 of the 2026-09-08 fix round:
// "Facet rows are ~33px tall with the checkbox floating left of a 14px gap. Rows are 24px,
// checkbox 14px, label 12.5px, count 11px muted right-aligned, tabular." Artboard 02/id="p2"'s
// FILTERS card draws that row as `padding:4px 0;font-size:12.5px` around a `width:13px;height:13px`
// checkbox, with the rows stacked directly against one another: 24px tall, 0px of clearance.
// ux-assert.mjs's law-2 floor requires every interactive target to be >=44px on its shorter axis,
// or >=24px with >=8px of clear space from every other target. A 24px row with an adjacent 24px row
// above and below satisfies neither branch, so implementing the artboard turned four UX smoke specs
// red at 1280 (`input[cl-facet-check] 1152x24px (0px from a neighbour)`).
//
// WHY THIS IS AN EXEMPTION AND NOT A RELAXATION. Law 2 is a TOUCH-target law; the artboard is a
// 1440 desktop drawing. The two are reconciled by width, not by compromise: `.cl-facet-row` /
// `.cl-facet-more` take `min-height: 44px` below 768px (src/app/globals.css), which is the width
// band where a finger is the pointer, and the design audit measures BOTH ends of that —
// spec/list-surface.json reads 24px back at 1440, spec/mobile-11-watchlist.json reads 44px back at
// 390 on the one surface that still draws this card there. So the rule below suppresses the law-2
// floor only at >=768px, only for the one named target, and only while the entry has not expired;
// a lane that deletes the globals.css rule breaks the SAME specs at 375, where nothing here applies.
//
// Same posture as exemptions-375.mjs, which this file deliberately copies rather than extends: that
// file's axis is a PAGE at one viewport (its `isExempt375` hard-codes "@375"), this one's axis is a
// COMPONENT above a viewport floor. Both are dated against F25's `latestTrainWave()` oracle, both
// are read by run-rendering-guard.mjs, and neither ever suppresses a failure line that names
// anything other than what it declares.
export const LAW2_DESKTOP_EXEMPTIONS = [
  {
    component: "FiltersRailCard facet row (src/components/list-surface/ListSurfaceRailCards.tsx)",
    // The `nameOf` form ux-assert.mjs's collector emits for this element: tag + [className], because
    // an <input> has neither aria-label nor text. Confirmed by reading the guard's own failure
    // output verbatim, not guessed.
    targetName: "input[cl-facet-check]",
    minViewport: 768,
    reason:
      "operator item C1, 2026-09-08: artboard 02/id=\"p2\" draws the desktop rail facet row at 24px with no clearance; the 44px touch target is restored below 768px in globals.css and measured at 390 by the design audit",
    dated: "2026-09-08",
    expiryWave: 70,
  },
];

/** The viewport a rendering-guard failure line was measured at, or null when it carries none. */
export function viewportOf(failureLine) {
  const m = /@(\d+)/.exec(String(failureLine));
  return m ? Number(m[1]) : null;
}

/**
 * True when a law-2 failure line is fully covered by a still-active entry.
 *
 * Deliberately strict, because a loose matcher here would hide real defects behind a facet row:
 *  - the line must be a law-2 target-floor failure (no other detector is ever suppressed);
 *  - its viewport must be at or above the entry's `minViewport` (375/390 is never exempt);
 *  - the line must not be truncated (assertUxClean appends ", …" past eight targets — a truncated
 *    line could be hiding a target this file has never seen, so it is left as a real failure);
 *  - the number of targets it names must equal the count it declares; and
 *  - EVERY named target must be an exempted one. A line mixing a facet row with any other
 *    undersized control stays red.
 * Pure.
 */
export function isExemptLaw2Desktop(failureLine, activeEntries) {
  const line = String(failureLine);
  if (!line.includes("below the law-2 floor")) return false;
  if (line.trimEnd().endsWith(", …")) return false;
  const vp = viewportOf(line);
  if (vp === null) return false;
  const declared = /: (\d+) interactive target\(s\)/.exec(line);
  if (!declared) return false;
  const dash = line.indexOf(" — ");
  if (dash === -1) return false;
  const named = line
    .slice(dash + 3)
    .split(", ")
    .map((s) => s.trim())
    .filter(Boolean);
  if (named.length !== Number(declared[1])) return false;
  const usable = activeEntries.filter((e) => vp >= e.minViewport);
  if (usable.length === 0) return false;
  return named.every((n) => usable.some((e) => n.startsWith(`${e.targetName} `)));
}

/** Entries whose expiryWave has not yet been reached (or whose wave is unknown — best-effort, the
 *  same posture exemptions-375.mjs and F25's own oracle take). */
export function activeLaw2Exemptions(list, latestWave) {
  return list.filter((e) => latestWave === null || latestWave < e.expiryWave);
}
