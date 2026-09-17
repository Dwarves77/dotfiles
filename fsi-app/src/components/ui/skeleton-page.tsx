// src/components/ui/skeleton-page.tsx (lane L33, 2026-09-17)
//
// ONE home for the ROUTE-LEVEL loading skeleton primitives the eight loading.tsx files (four index
// routes, four detail routes, perf lane 2026-09-03) each redefined: the pulsing page frame with the
// ledger's own width and padding, and the proportioned placeholder box. Each loading.tsx keeps its own
// layout (it mirrors its route's section order so nothing jumps when content lands) and composes these.
//
// Why this is not inside Skeleton.tsx: that module is "use client" and holds COMPONENT skeletons in final
// geometry (a list row, a band tile, a stat block) with the `--tag` shimmer; a route's loading.tsx is a
// server component and calls `skeletonBox` during server render, which a client-module export cannot
// serve. Two modules, two render boundaries, both named here and in Skeleton.tsx's header.
//
// Presentation only: the markup and styles are byte-identical to what the eight files rendered before the
// extraction (rendering guard and F35 unaffected).
import type { CSSProperties, ReactNode } from "react";

/** A placeholder block in the raised surface colour. */
export function skeletonBox(h: number, w: string | number = "100%"): CSSProperties {
  return { height: h, width: w, borderRadius: 6, background: "var(--color-surface-raised)" };
}

/** The pulsing page frame every route skeleton renders inside (the ledger's max width and padding). */
export function SkeletonPage({ children }: { children: ReactNode }) {
  return (
    <div className="animate-pulse" style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 32px" }}>
      {children}
    </div>
  );
}
