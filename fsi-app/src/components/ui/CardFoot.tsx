"use client";

/**
 * CardFoot — the foot strip at the bottom of a section card (UI system
 * handoff 2026-09-06): one muted line left, one right, on the page-tint
 * ground, separated from the rows by the header-weight divider.
 *
 * PROMOTED to the shared layer by lane comp-11 (2026-09-08), same reason as
 * `SectionHeading`: it was page-local inside `DashboardBrief.tsx`, and
 * artboard 11 (id="p11") carries the identical strip at the foot of its
 * Watched card ("Watch from any row's ⋯ menu or the Watch button on a detail
 * page." / "Browse regulations →"). One definition, both callers.
 *
 * VALUES, read off the artboard markup (dc.html p1 line 348 and p11 line 111,
 * which are byte-identical):
 *   display flex · justify space-between · align-items center · gap 12
 *   padding 10px 16px · border-top 1px solid rgba(0,0,0,.08) (--line-2)
 *   background #FAFAF8 (--page) · font-size 12px · muted text
 *
 * Three of those (the #FAFAF8 ground, the 12px size, centre alignment) were
 * absent from the page-local version this replaces; the artboards state all
 * three, so they are corrected here rather than carried forward.
 *
 * Either side may be a link: the artboards put the link left on the dashboard
 * ("All 14 immediate →") and right on the watchlist ("Browse regulations →"),
 * so this component takes two arbitrary nodes and imposes no role on either.
 */

import type { ReactNode } from "react";

export interface CardFootProps {
  left: ReactNode;
  right: ReactNode;
}

export function CardFoot({ left, right }: CardFootProps) {
  return (
    <div
      className="cl-card-foot"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderTop: "1px solid var(--line-2)",
        background: "var(--page)",
        fontSize: "var(--fs-12)",
        color: "var(--ink-3)",
      }}
    >
      <span>{left}</span>
      <span style={{ whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
}
