"use client";

/**
 * SectionHeader — the canonical Anton-30px / 2px ink-rule / right-aligned aside
 * pattern from design_handoff_2026-04/preview/shell.css `.sh`.
 *
 * Every section header on every editorial page should route through this — if
 * you find inline `.sh` markup or copy-pasted CSS in a page rebuild, replace
 * with this component.
 *
 * Spec (matches dashboard-v3.html):
 *   - flex baseline-aligned, justify-between
 *   - 2px ink rule (border-bottom: 2px solid var(--text))
 *   - 10px padding-bottom, 18px margin-bottom
 *   - Title: Anton 30px, font-weight 400, tracking +0.04em, uppercase
 *   - Aside: 11px, font-weight 700, tracking +0.08em, uppercase, ink color
 *
 * Wrap a section's content with SectionHeader at the top + a wrapping
 * <section> with marginBottom: 40px to match the `.section` rule.
 */

import type { ReactNode } from "react";

interface SectionHeaderProps {
  /** Big Anton headline. e.g. "This Week" / "Replaced". */
  title: string;
  /** Right-aligned uppercase aside. Accepts ReactNode so callers can include
   *  bolded numbers. e.g. <>Weekly briefing · <b>Apr 18</b></>. */
  aside?: ReactNode;
  /** Optional id for in-page anchors. */
  id?: string;
}

export function SectionHeader({ title, aside, id }: SectionHeaderProps) {
  return (
    <div
      id={id}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "16px",
        paddingBottom: "10px",
        borderBottom: "2px solid var(--text)",
        marginBottom: "18px",
        flexWrap: "wrap",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "30px",
          fontWeight: 400,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: 0,
          lineHeight: 1,
          color: "var(--text)",
        }}
      >
        {title}
      </h2>
      {aside && (
        <div
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          {aside}
        </div>
      )}
    </div>
  );
}
