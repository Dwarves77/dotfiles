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
 * ABSENCE RULE, REVISED (lane PARITY-PARTS look-only pass, 2026-09-25, against the new artboards
 * merged in #801; coordinator close addendum 2026-09-25 verbatim: "the absence rule is now 'a
 * value that exists is shown; one that cannot exist yet names the data it needs' ... This REVERSES
 * #800's 'renders nothing' behaviour"). README 0.4 (as re-exported 2026-09-25): "If the value
 * exists in the data, show it. If it can't exist yet, a small-caps line names the data it needs,
 * starting with 'needs': `needs primary-source figure . needs one more month of series . needs
 * your shipment data . connect (arrow) . needs scoring inputs`. The words 'pending', 'unscored'
 * and 'not scored' never render."
 *
 * OPERATOR CHECK 5 (2026-09-24, "a missing value renders NOTHING") is SUPERSEDED by this ruling,
 * one day later, for the `reason` variant: it now renders the needs-phrase instead of nothing.
 * `NEEDS_PHRASE` is the generic, closed mapping for the four platform-wide reasons (rule 19: the
 * board's own per-instance examples - "needs 4 price inputs", "needs one more month of series" -
 * are EXAMPLES of the pattern, not additions to the vocabulary a look-only pass may invent per call
 * site; a call site that knows a more specific need can still say so via its own copy, this
 * component only supplies the closed-vocabulary default).
 *
 *   - `reason` (default): renders the needs-phrase as small-caps text where the value would sit.
 *   - `narrow` / `dash`: UNCHANGED from the 2026-09-24 ruling (DEFECT 3, this file's own header
 *     note) - a fixed-width table/row cell too small for the phrase still draws the em dash, with
 *     the needs-phrase carried on `aria-label`/`title` for assistive technology. The new board text
 *     does not name the narrow-cell case, and a numeric column a few characters wide cannot hold
 *     "needs primary-source figure" without breaking the row height DEFECT 3 exists to prevent;
 *     flagged as a Design Change Owed for coordinator confirmation rather than guessed here (rule 20).
 *
 * Enforced by rendering-guard rule RD-84's check 5 (parity-checks-smoke.mjs; the pre-existing
 * reference to "RD-87" here was a stale typo, check 5 is registered under RD-84, same invariant
 * as check 8 below), its FORBIDDEN literal list is unchanged (all lowercase NEEDS_PHRASE values
 * can never collide with the check's uppercase literals), proven by attack against the pre-fix part.
 */
export const NEEDS_PHRASE: Readonly<Record<AbsenceReason, string>> = {
  "not in primary source": "needs primary-source figure",
  pending: "needs more data",
  unscored: "needs scoring inputs",
  "connect data": "connect ↗",
};

export function Absence({ reason, variant = "reason" }: { reason: AbsenceReason; variant?: "reason" | "narrow" | "dash" }) {
  if (variant === "reason") {
    return (
      <span
        data-absence="needs"
        data-part="absence"
        data-part-variant={variant}
        style={ABSENCE_TEXT_STYLE}
      >
        {NEEDS_PHRASE[reason]}
      </span>
    );
  }
  if (variant === "dash" || variant === "narrow") {
    return (
      <span
        className="cl-absence-dash"
        data-absence="dash"
        aria-label={NEEDS_PHRASE[reason]}
        title={NEEDS_PHRASE[reason]}
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
