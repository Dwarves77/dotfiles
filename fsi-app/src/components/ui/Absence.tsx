"use client";

/**
 * Absence — the one absence convention (UI system handoff 2026-09-06,
 * README §0.4): a small-caps reason from a fixed vocabulary sits where the
 * value would. No grey boxes, no red, never a second full row.
 */

export type AbsenceReason = "not in primary source" | "pending" | "unscored" | "connect data";

/**
 * The absence TYPE TREATMENT, exported so a component rendering a
 * sentence-shaped "nothing here" line the fixed vocabulary cannot express
 * (dc.html p11's "no recalculations on watched items since Sep 4") types it
 * identically instead of re-deriving these five declarations. The vocabulary
 * itself stays closed: this export carries the treatment, never any text.
 * Added by lane comp-11 (2026-09-08) for `RecalculationNotice`'s bare empty
 * state.
 */
export const ABSENCE_TEXT_STYLE = {
  fontSize: "var(--fs-105)",
  textTransform: "uppercase",
  fontWeight: 600,
  letterSpacing: "0.08em",
  color: "var(--ink-3)",
} as const;

/**
 * DEFECT 3, lane opsclip (train 61, 2026-09-08). Measured on production: the
 * TIER cell of the dashboard tables is a 40px grid column, and rendering
 * "NOT IN PRIMARY SOURCE" into it wrapped the phrase over THREE lines, making
 * those rows roughly twice the height of their neighbours and breaking the
 * table's rhythm — the tallest thing on the dashboard. The same string shouts
 * over three lines in every empty cell of the operations matrix, where the
 * artboard (dc.html p8) draws a single em dash and explains it once in the
 * card's foot strip.
 *
 * THE RULE, decided here and applied once so no surface decides it again:
 *
 *   A NARROW cell gets the dash. A WIDE cell gets the small-caps reason.
 *
 * "Narrow" means a fixed track too small to hold the vocabulary on one line —
 * the list row's 40px TIER column, the matrix's region columns. Ruling 2.1
 * owns the VOCABULARY and is not weakened by this: `variant="narrow"` still
 * takes a reason from the closed set, still says it to assistive technology
 * via `aria-label`, and still says it to a sighted reader on hover via
 * `title`. What changes is only its PRESENTATION in a cell that cannot show
 * it without deforming the row, which is what the artboard governs. Logged in
 * DEVIATION-LOG.md.
 *
 * The dash is `—` (U+2014), which the app's own source-entry-filter SoT lists
 * in NO_DATA_TOKENS as a placeholder-name token. That collision is already
 * disclosed and carved out for the honest-dash case in two rendering-guard
 * specs (detail-surfaces-smoke.mjs's unrated tier chip, map-smoke.mjs's
 * no-active-themes cell); this variant is the third instance of the same
 * disclosed, confirmed-safe case, never fabricated content.
 */
export function Absence({ reason, variant = "reason" }: { reason: AbsenceReason; variant?: "reason" | "narrow" }) {
  if (variant === "narrow") {
    return (
      <span
        aria-label={reason}
        title={reason}
        style={{ ...ABSENCE_TEXT_STYLE, fontSize: "var(--fs-12)", letterSpacing: "normal" }}
      >
        {"—"}
      </span>
    );
  }
  return <span style={ABSENCE_TEXT_STYLE}>{reason}</span>;
}
