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

export function Absence({ reason }: { reason: AbsenceReason }) {
  return <span style={ABSENCE_TEXT_STYLE}>{reason}</span>;
}
