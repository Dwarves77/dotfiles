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
      className="cl-page-masthead"
      style={{
        background: "var(--raised)",
        borderBottom: "1px solid var(--border-sub)",
        padding: belowSlot ? "30px 36px 34px" : "30px 36px 28px",
      }}
    >
      {/* Responsive type ramp + padding step-down per operator dispatch
          2026-05-12 issue 4: "We need to design the system to have small
          fonts on all pages to fit the design on mobile." The Anton title
          shipped at a fixed 44px and consumed the entire mobile viewport
          on long regulation titles. clamp() lets desktop keep the design's
          44px feel while mobile (320-414px) shrinks to ~26-32px. The
          masthead padding also tightens on narrow viewports so the
          header stops dominating the page. The .cl-page-title hook is
          kept stable so future surfaces can target the title directly
          without re-deriving the scale here. */}
      <style>{`
        .cl-page-masthead .cl-page-title {
          font-size: clamp(26px, 6.5vw, 44px);
          line-height: 1.02;
        }
        .cl-page-masthead .cl-page-meta {
          font-size: clamp(11px, 1.6vw, 13px);
        }
        @media (max-width: 640px) {
          .cl-page-masthead {
            padding: 18px 18px 16px !important;
          }
          .cl-page-masthead .cl-page-eyebrow {
            font-size: 9px;
            letter-spacing: 0.18em;
            margin-bottom: 6px;
          }
        }
      `}</style>
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
              className="cl-page-eyebrow"
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
            className="cl-page-title"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              color: "var(--text)",
              margin: "0 0 6px",
              // Wrap long titles instead of overflowing. Long jurisdictional
              // titles (e.g. "Estonian Parliament Session Agenda - May 11,
              // 2026") need word-wrap because the Anton glyphs are wide
              // and viewports below ~400px otherwise force horizontal
              // scrolling on the entire page.
              wordBreak: "break-word",
              overflowWrap: "break-word",
            }}
          >
            {title}
          </h1>
          {meta && (
            <div
              className="cl-page-meta"
              style={{
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
