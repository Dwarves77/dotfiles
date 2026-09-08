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
export function Absence({ reason, variant = "reason" }: { reason: AbsenceReason; variant?: "reason" | "narrow" | "dash" }) {
  if (variant === "dash") {
    return (
      <span
        className="cl-absence-dash"
        data-absence="dash"
        aria-label={reason}
        title={reason}
        style={{ fontSize: "inherit", color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}
      >
        {"—"}
      </span>
    );
  }
  if (variant === "narrow") {
    return (
      <span
        // The rendering guard's placeholder-literal scan reads this attribute and skips the
        // element (harness.mjs's measureGuard). That is narrower and more honest than the
        // per-spec "—" allowlists two smoke specs already carry: a dash CARRYING its
        // closed-vocabulary reason is disclosed structurally, once, by the part that renders it,
        // while a bare "—" anywhere else in the product stays a placeholder literal and still
        // fails the guard.
        className="cl-absence"
        data-absence="narrow"
        aria-label={reason}
        title={reason}
        style={{ ...ABSENCE_TEXT_STYLE, fontSize: "var(--fs-12)", letterSpacing: "normal" }}
      >
        {/* FOLD-61, and this is a RULING the two lanes needed and neither could make alone.
            opsclip's narrow rule says a cell too small to hold the phrase draws the dash; the
            mobile 390 spec's operator prose says, in his own words, "Absence keeps its small-caps
            reason". Both are right, about different widths, and the disagreement is only apparent:
            "narrow" is a property of the CELL, not of the page. The tier track is a hard 40px
            above 768, which is where the phrase wrapped over three lines and doubled the row
            height; below 768 the row reflows to `3px 1fr` and that cell is no longer narrow, so
            there is room for the words and the operator's own spec asks for them.

            So ONE token, in ONE element, taking the form its cell can hold: the dash above 768,
            the small-caps reason below it. Two sibling spans inside this one `.cl-absence` would
            be simpler to read but would not be one element, and the audit counts ELEMENTS
            (`count: 1` on `.cl-list-row .cl-absence`, lane mobfix61's D-M4 guarantee), so the
            swap is done with `content` on two pseudo-elements of this single span instead. The
            aria-label and title carry the closed-vocabulary reason at BOTH widths regardless, so
            nothing about ruling 2.1's vocabulary depends on the viewport. */}
        <style>{`
          .cl-absence[data-absence="narrow"]::after { content: "\\2014"; }
          .cl-absence[data-absence="narrow"] > .cl-absence-word { display: none; }
          @media (max-width: 767px) {
            .cl-absence[data-absence="narrow"]::after { content: none; }
            .cl-absence[data-absence="narrow"] > .cl-absence-word { display: inline; }
          }
        `}</style>
        <span className="cl-absence-word" style={{ ...ABSENCE_TEXT_STYLE, fontSize: "inherit", letterSpacing: "0.06em" }}>
          {reason}
        </span>
      </span>
    );
  }
  // `cl-absence` (lane mobfix61, 2026-09-08) is what makes "one reason per row" MECHANICALLY
  // checkable: the audit asserts `count: 1` on `.cl-list-row .cl-absence`, so a part that begins
  // rendering a second token is a red audit row rather than something the operator finds on his
  // phone.
  return (
    <span className="cl-absence" style={ABSENCE_TEXT_STYLE}>
      {reason}
    </span>
  );
}
