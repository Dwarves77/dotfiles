"use client";

/**
 * Absence — the one absence convention (UI system handoff 2026-09-06,
 * README §0.4): a small-caps reason from a fixed vocabulary sits where the
 * value would. No grey boxes, no red, never a second full row.
 */

export type AbsenceReason = "not in primary source" | "pending" | "unscored" | "connect data";

export function Absence({ reason }: { reason: AbsenceReason }) {
  return (
    <span
      style={{
        fontSize: "var(--fs-105)",
        textTransform: "uppercase",
        fontWeight: 600,
        letterSpacing: "0.08em",
        color: "var(--ink-3)",
      }}
    >
      {reason}
    </span>
  );
}
