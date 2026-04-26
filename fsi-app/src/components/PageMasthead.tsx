"use client";

/**
 * PageMasthead — editorial page header.
 *
 * Renders the eyebrow + Anton title + meta line block below the 3px
 * navy→red gradient chrome (which lives on AppShell, not here).
 *
 * Matches design_handoff_2026-04/preview/shell.css `.masthead` rules:
 *   - background: var(--raised)
 *   - 30/36px padding, hairline border-bottom
 *   - Anton 44px title, uppercase, tracking +0.02em
 *   - 10px accent eyebrow, uppercase, tracking +0.20em
 *   - 12px muted meta line, tracking +0.04em
 *
 * The gradient bar at the very top of the page is shell chrome and
 * lives on AppShell — do NOT add a ::before gradient here or you'll
 * end up with two bars stacked.
 */

import type { ReactNode } from "react";

interface PageMastheadProps {
  /** Small uppercase kicker line, accent-colored. e.g. "VOL IV · NO. 112 · THURSDAY" */
  eyebrow?: string;
  /** Big Anton headline, uppercase. e.g. "DASHBOARD — YOUR BRIEF" */
  title: string;
  /** Muted meta line below the title. e.g. "April 18, 2026 · 155 regulations" */
  meta?: ReactNode;
  /** Optional right-side slot — buttons, status, etc. */
  rightSlot?: ReactNode;
  /** Optional content below the title block, inside the masthead container.
   *  Used by the dashboard for the 4-up hero strip per dashboard-v3.html. */
  belowSlot?: ReactNode;
}

export function PageMasthead({ eyebrow, title, meta, rightSlot, belowSlot }: PageMastheadProps) {
  return (
    <header
      style={{
        background: "var(--raised)",
        borderBottom: "1px solid var(--border-sub)",
        padding: belowSlot ? "30px 36px 34px" : "30px 36px 28px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          {eyebrow && (
            <div
              style={{
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: "8px",
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "44px",
              fontWeight: 400,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              color: "var(--text)",
              margin: "0 0 6px",
              lineHeight: 1,
            }}
          >
            {title}
          </h1>
          {meta && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                letterSpacing: "0.04em",
              }}
            >
              {meta}
            </div>
          )}
        </div>
        {rightSlot && (
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px" }}>
            {rightSlot}
          </div>
        )}
      </div>
      {belowSlot}
    </header>
  );
}
