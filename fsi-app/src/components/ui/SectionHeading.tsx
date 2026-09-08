"use client";

/**
 * SectionHeading — the one section-card head (UI system handoff 2026-09-06).
 * Anton title left, small-caps aside right, sitting directly under the card's
 * own `SectionRule`.
 *
 * PROMOTED to the shared layer by lane comp-11 (2026-09-08). It was a
 * page-local function inside `DashboardBrief.tsx`; artboard 11 (id="p11")
 * carries the byte-identical head on both its cards ("Watched · 1 / Sorted by
 * next date", "Recalculation notices / Since your last visit"), so a second
 * copy on the watchlist would have been exactly the duplication CLAUDE.md
 * rule 13 forbids. DashboardBrief now imports this and renders unchanged
 * markup.
 *
 * VALUES, read off the artboard markup (dc.html p1 line "Due next · 5 items"
 * and p11 line "Watched · 1", which agree):
 *   container  display flex · align-items baseline · justify space-between
 *              gap 16 · padding 14px 16px 10px
 *   title      Anton, uppercase, letter-spacing .04em, 20px, nowrap
 *   aside      10.5px · letter-spacing .12em · uppercase · #7A6E6C · nowrap
 *
 * The aside's weight is the one place the two artboards disagree (p1 says 500,
 * p11 says 600); 600 is taken, and the prior local value (800) is dropped —
 * both artboards refute it. Logged in DEVIATION-LOG.md.
 *
 * Ruling 4.1/5.1 (2026-09-07, CLOSED): NO divider below the title. The
 * artboards still draw a `border-bottom` under this head; the ruling is later
 * than the artboards and explicitly sitewide, so the ruling wins and no border
 * is emitted here.
 */

import type { ReactNode } from "react";

export interface SectionHeadingProps {
  title: ReactNode;
  aside?: ReactNode;
}

export function SectionHeading({ title, aside }: SectionHeadingProps) {
  return (
    <div
      className="cl-section-heading"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 16px 10px",
      }}
    >
      {/* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 by
          .discipline/rendering/audit/spec/mobile-01-dashboard.json]: the title and the
          aside are both `white-space: nowrap`, sized for the 778px content column. At
          390 "DUE NEXT · 5 ITEMS" plus "SORTED BY NEXT DATE" is 286px past the card's
          right edge, exactly the overflow/collision class the operator's visual-pass
          standard forbids. Below 768 the head stacks (the same reflow globals.css's
          `.cl-section-head` already uses for the detail surfaces' own heads) and the
          aside is allowed to wrap. One rule on the shared part; the mobile 390 spec
          states no measure for this head, so nothing else about it changes and the
          deviation is logged. */}
      <style>{`
        @media (max-width: 767px) {
          .cl-section-heading { flex-direction: column !important; align-items: flex-start !important; gap: 3px !important; }
          .cl-section-heading .cl-section-heading-aside { white-space: normal; }
        }
      `}</style>
      <h2
        data-guard-title
        data-guard-display="card-title"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 20,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          margin: 0,
          color: "var(--ink)",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </h2>
      {aside && (
        <span
          className="cl-section-heading-aside"
          style={{
            fontSize: "var(--fs-105)",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
            whiteSpace: "nowrap",
          }}
        >
          {aside}
        </span>
      )}
    </div>
  );
}
