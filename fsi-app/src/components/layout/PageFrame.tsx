import type { ReactNode } from "react";

type PageFramePadding = "default" | "account";

const PADDING: Record<PageFramePadding, string> = {
  default: "20px 40px 40px",
  account: "18px 40px 40px",
};

interface PageFrameProps {
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
