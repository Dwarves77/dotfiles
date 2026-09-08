"use client";

/**
 * BandTileRow — the container the four BandTiles sit in (UI system handoff
 * 2026-09-06, README §0.4 "Band tiles"; mobile 390 spec, BAND TILES).
 *
 * Four across on desktop; 2x2 with a 10px gap below 768, which is the rule
 * declared once in BandTile.tsx beside the tile's own mobile measures and
 * keyed off the `cl-band-tiles` class this component applies.
 *
 * WHY IT EXISTS (lane mobfix61, 2026-09-08, operator mobile report D-M1,
 * CLAUDE.md rule 13). The row was written out by hand at three call sites —
 * DashboardBrief, ListSurfaceShell and OnboardingWizard — each with its own
 * copy of `display: grid; gridTemplateColumns: repeat(4, 1fr)`. The class
 * that carries the mobile rule was on two of the three, so the onboarding
 * preview kept four 67px tiles across at 390 with its labels clipped to
 * "IMMEDIAT" / "AWARENE" and its numeral over the tile edge, exactly as the
 * operator photographed on /regulations before the list shell was given the
 * class. A container that has to be remembered at every call site is the
 * defect; there is now one container and nothing to remember.
 *
 * The desktop DOM is byte-identical to what DashboardBrief and
 * ListSurfaceShell rendered before (`repeat(4, 1fr)`, gap 14), so no 1440
 * audit spec is re-baselined by this change.
 */

import type { ReactNode } from "react";

export function BandTileRow({
  children,
  /** Desktop gap. Defaults to the 14px the dashboard and the five list
   *  surfaces use; the onboarding preview's tighter 8px is passed in. Below
   *  768 the mobile rule's 10px wins for every caller, per the spec's single
   *  "2x2 grid, gap 10px" statement. */
  gap = 14,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return (
    <div className="cl-band-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap }}>
      {children}
    </div>
  );
}
