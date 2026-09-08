/**
 * PageFrame - THE content frame. One definition, for the whole product.
 *
 * UI system handoff 2026-09-06, README §0.3, verbatim: "Content grid:
 * `padding: 20px 40px 40px; grid-template-columns: minmax(0,1fr) 300px;
 * gap: 28px; align-items: start`. At 1440 that is a 778px content column and
 * a 300px rail." And: "Below 1280 the rail stacks under the content."
 *
 * WHY THIS FILE EXISTS (lane layoutguard, 2026-09-08). Nine surfaces carried
 * their own copy of that grid as an inline style, and the copies had already
 * drifted: `/profile` shipped `padding:16px 40px 80px`, `/settings` shipped
 * `18px 40px 0`, the four detail surfaces shipped `gap:24px` and no padding
 * at all, and `/admin` shipped an explicit `width:768px` on the content
 * column - the operator's own root cause on 2026-09-08 ("The admin content
 * column is not constrained by the frame grid ... Fix the frame, not the
 * cards"). Nine copies is why: there was nothing to fix, only nine things.
 *
 * THE STACK BELOW 1280 IS THE HANDOFF'S OWN RULE, not an invented responsive
 * behaviour: ruling R10 (2026-09-07) forbids inventing 1024/390 behaviour,
 * and README §0.3 states this one. `minmax(0, 1fr)` and not a bare `1fr`,
 * because a bare `1fr` is `minmax(auto, 1fr)` whose auto minimum is the
 * item's min-content width - MOBILE-60 measured that growing the single
 * track to 539px inside a 390px viewport.
 *
 * `padding` takes the ARTBOARD's value where an artboard differs: p14
 * (account) and p15 (settings) draw `18px 40px 40px` in the dc.html, and the
 * artboard is the spec. Everything else is `20px 40px 40px`.
 *
 * The site-wide layout guard's L1 measures this rendered grid against the
 * dc.html's own numbers (`.discipline/rendering/layout-guard/allowlists.mjs`
 * FRAME_SPEC), never against this file - comparing the build to the build
 * would prove nothing.
 */

import type { ReactNode } from "react";

export type PageFramePadding = "default" | "account";

const PADDING: Record<PageFramePadding, string> = {
  default: "20px 40px 40px",
  account: "18px 40px 40px",
};

export interface PageFrameProps {
  /** The content column (grid column 1). */
  children: ReactNode;
  /** The 300px rail (grid column 2). Omit on a route whose artboard draws no rail. */
  rail?: ReactNode;
  /** Artboard padding variant: `account` is p14/p15's 18px top, everything else 20px. */
  padding?: PageFramePadding;
  /** Extra class on the frame element, for a surface that still carries page-local CSS. */
  className?: string;
}

export function PageFrame({ children, rail, padding = "default", className }: PageFrameProps) {
  return (
    <div
      data-guard-frame
      className={className ? `cl-page-frame ${className}` : "cl-page-frame"}
      style={{
        padding: PADDING[padding],
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        gap: 28,
        alignItems: "start",
      }}
    >
      {/* Class-scoped, not id-scoped: a render-time counter would differ between the server and
          the client render and produce a hydration mismatch, and no route nests one frame inside
          another. Below 768 the mobile-390 spec's container padding (MOBILE-60, measured). */}
      <style>{`
        @media (max-width: 1280px) { .cl-page-frame { grid-template-columns: minmax(0, 1fr) !important; } }
        @media (max-width: 767px) { .cl-page-frame { padding: 14px 16px 16px !important; } }
      `}</style>
      {/* `children` and `rail` are the grid ITEMS themselves, not wrapped in a div of this
          component's own: every adopting surface already renders a `minWidth: 0` column element,
          and inserting a wrapper would change the descendant structure the design audit's
          per-artboard specs measure. The frame owns the grid; the column owns its own box. */}
      {children}
      {rail}
    </div>
  );
}
