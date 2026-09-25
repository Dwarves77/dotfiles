"use client";

/**
 * Absence — the one absence convention (UI system handoff 2026-09-06,
 * README §0.4): a small-caps reason from a fixed vocabulary sits where the
 * value would. No grey boxes, no red, never a second full row.
 */

export type AbsenceReason = "not in primary source" | "pending" | "unscored" | "connect data";

/**
 * THE PRECEDENCE (lane mobfix61, 2026-09-08, operator mobile report D-M4).
 *
 * A composite element — a list row above all — can have several dimensions
 * missing at once, and until now each part rendered its own token
 * independently: the operator photographed one dashboard row carrying a
 * dashed baseline, then "UNSCORED", then "PENDING", then "NOT IN PRIMARY
 * SOURCE" on a line of its own. Ruling 2.1 (P1, operator, 2026-09-07) and
 * the mobile 390 spec say the same thing — ONE small-caps reason, never a
 * second row — so the vocabulary needs an ORDER. This is it, most specific
 * (names the root cause) first:
 *
 *   1. "connect data"          nothing is connected, so nothing can be known
 *   2. "not in primary source" the item is not in the source of record, which
 *                              is WHY its later dimensions are missing
 *   3. "pending"               a value is expected and not yet determined
 *
 * "unscored" is deliberately NOT in the order and is never chosen as a
 * reason: it names the STATE the 30px dashed baseline already draws, so
 * rendering it as a token too is exactly the tautological second token
 * ruling 2.1 removes ("the literal UNSCORED is removed everywhere; unscored
 * is a 30px dashed baseline plus ONE small-caps reason"). It stays in
 * `AbsenceReason` because the vocabulary is the operator's; nothing in the
 * row anatomy passes it.
 */
export const ABSENCE_PRECEDENCE: readonly AbsenceReason[] = ["connect data", "not in primary source", "pending"];

/**
 * Pick the single reason for a composite from the reasons its own dimensions
 * support. Callers pass one candidate per missing dimension, in any order;
 * the precedence above decides. Null when nothing is missing.
 */
export function pickAbsenceReason(candidates: (AbsenceReason | null | undefined)[]): AbsenceReason | null {
  for (const reason of ABSENCE_PRECEDENCE) {
    if (candidates.includes(reason)) return reason;
  }
  return null;
}

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
 * table's rhythm, the tallest thing on the dashboard. The same string shouts
 * over three lines in every empty cell of the operations matrix, where the
 * artboard (dc.html p8) draws a single em dash and explains it once in the
 * card's foot strip.
 *
 * THE RULE, decided here and applied once so no surface decides it again:
 *
 *   A NARROW cell gets the dash. A WIDE cell gets the small-caps reason.
 *
 * "Narrow" means a fixed track too small to hold the vocabulary on one line:
 * the list row's 40px TIER column, the matrix's region columns. Ruling 2.1
 * owns the VOCABULARY and is not weakened by this: `variant="narrow"` still
 * takes a reason from the closed set, still says it to assistive technology
 * via `aria-label`, and still says it to a sighted reader on hover via
 * `title`. What changes is only its PRESENTATION in a cell that cannot show
 * it without deforming the row, which is what the artboard governs. Logged in
 * DEVIATION-LOG.md.
 *
 * FOLD-61: this variant and lane mobfix61's ONE-ABSENCE-PER-ROW precedence
 * (ABSENCE_PRECEDENCE / pickAbsenceReason above) are the two halves of ONE
 * mechanism, not two mechanisms. The precedence decides WHICH reason a row
 * shows and which cell owns it; this variant decides how that one reason is
 * DRAWN where the cell cannot hold the phrase. Both halves carry the
 * `cl-absence` class, so the audit's `count: 1` assertion over
 * `.cl-list-row .cl-absence` counts the dash too and a narrow cell can never
 * be used to smuggle a second token past the check.
 *
 * The dash is `—` (U+2014), which the app's own source-entry-filter SoT lists
 * in NO_DATA_TOKENS as a placeholder-name token. Two rendering-guard specs
 * already carve the honest-dash case out per spec (detail-surfaces-smoke.mjs's
 * unrated tier chip, map-smoke.mjs's no-active-themes cell). This variant does
 * not need a third such allowlist: it declares itself with `data-absence`,
 * which the guard's own scan skips, so a bare `—` anywhere else in the product
 * still fails the guard exactly as it should.
 */
/**
 * THE DASH VARIANT (item B3/B4/B5, operator UI fix round 2026-09-08).
 *
 * The operator's ruling of 2026-09-08 moves the row's single small-caps reason
 * OUT of the value cells and into the title cell's meta line, and puts an em
 * dash in each value cell that has nothing to show: "the meter column gets the
 * 30px dashed baseline with an em dash in the score slot", "the tier cell gets
 * an em dash", "the date cell gets an em dash". dc.html p1's own second list
 * row draws exactly that (impact `—` at 11px #7A6E6C, next-date `—` at 12.5px
 * #7A6E6C), so artboard and ruling agree here.
 *
 * This variant is that dash and nothing else: no word at any viewport (unlike
 * `narrow`, which swaps to the word below 768 — that swap would put a SECOND
 * token on a mobile row now that the meta line carries the reason). It still
 * carries the closed-vocabulary reason on `aria-label`/`title`, and it declares
 * itself with `data-absence` so the rendering guard's placeholder-literal scan
 * skips it while a bare `—` anywhere else still fails.
 *
 * It deliberately does NOT carry the `cl-absence` class: that class is the
 * countable "one reason per row" token (impactmeter.json forbids
 * `[data-audit="row-unscored"] .cl-absence`, and the D-M4 forbid counts cells
 * carrying it). A dash is a value placeholder, not a reason token, so it gets
 * its own `cl-absence-dash` class and is measured separately.
 *
 * Size and weight are inherited from the cell, because the artboard gives the
 * dash a different size in each column (11px in impact and timeline, 12.5px in
 * next-date). Only the colour is fixed here.
 */
/**
 * OPERATOR CHECK 5 (lane PARITY-PARTS, 2026-09-24, verbatim in substance): none of "PENDING",
 * "NOT IN PRIMARY SOURCE", "Connect shipment data" or "UNSCORED" may appear in the rendered DOM;
 * "a missing value renders NOTHING". This supersedes the README 0.4 small-caps reason convention
 * and the narrow variant's below-768 word swap. The class fix is here, in the one part every
 * surface already routes its missing values through, so no call site decides it again:
 *
 *   - `reason` renders nothing at all (no element, no text).
 *   - `narrow` renders the same value-placeholder dash as `dash` at every width (never the word).
 *   - `dash` is unchanged: an em dash is not one of the four forbidden strings, and README 0.4 draws
 *     it for an unscored meter ("four dashed outlines and an em dash, never a word").
 *
 * The reason still travels on `aria-label`/`title` of the dash, so the closed vocabulary is kept
 * for assistive technology; it is never painted. Enforced by rendering-guard rule RD-87
 * (parity-checks-smoke.mjs), proven by attack against the pre-fix part.
 */
export function Absence({ reason, variant = "reason" }: { reason: AbsenceReason; variant?: "reason" | "narrow" | "dash" }) {
  if (variant === "reason") return null;
  if (variant === "dash" || variant === "narrow") {
    return (
      <span
        className="cl-absence-dash"
        data-absence="dash"
        aria-label={reason}
        title={reason}
        data-part="absence"
        data-part-variant={variant}
        style={{ fontSize: "inherit", color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
      >
        {"—"}
      </span>
    );
  }
  return null;
}
