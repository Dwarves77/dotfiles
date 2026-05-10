"use client";

/**
 * HousekeepingSection — body section that wraps the two Housekeeping
 * widgets (Coverage gaps, Awaiting review) in a 2-up grid. Mirrors the
 * "This Week" / "Replaced" section rhythm: SectionHeader + 18px gap grid
 * + 40px bottom margin.
 *
 * The rail widgets stay typeset on the page surface; these body widgets
 * get card chrome (white surface, 1px border, --r-lg radius, --shadow)
 * applied via the .cl-hk-card class on each slot wrapper. That stylistic
 * split is intentional — see dashboard-sidebar-spec.html.
 *
 * Co-located helpers HousekeepingSkeleton and RailSkeleton are exported
 * here for the Suspense fallbacks in HomeSurface.
 */

import type { ReactNode } from "react";
import { SectionHeader } from "@/components/shell/SectionHeader";

export interface HousekeepingSectionProps {
  coverageGapsSlot: ReactNode;
  awaitingReviewSlot: ReactNode;
}

export function HousekeepingSection({
  coverageGapsSlot,
  awaitingReviewSlot,
}: HousekeepingSectionProps) {
  return (
    <section style={{ marginBottom: 40 }}>
      <SectionHeader
        title="Housekeeping"
        aside={<>Registry health · review queue</>}
      />
      <div className="cl-hk-two">
        <div className="cl-hk-card">{coverageGapsSlot}</div>
        <div className="cl-hk-card">{awaitingReviewSlot}</div>
      </div>
    </section>
  );
}

/** Card-shaped placeholder for the Housekeeping slots while their
 *  data promises resolve. Uses a muted block on the surface to match
 *  the card chrome the slots receive once mounted. */
export function HousekeepingSkeleton({ label }: { label?: string } = {}) {
  return (
    <div
      role="status"
      aria-label={label ? `${label} loading` : "Loading"}
      style={{
        height: 180,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, var(--color-bg-sunken) 0%, transparent 50%, var(--color-bg-sunken) 100%)",
        opacity: 0.6,
      }}
    />
  );
}

/** Typeset-shaped placeholder for the rail widgets while their data
 *  promises resolve. Lighter than the card skeleton; matches the
 *  no-chrome treatment of the rail. */
export function RailSkeleton({ label }: { label?: string } = {}) {
  return (
    <div role="status" aria-label={label ? `${label} loading` : "Loading"}>
      <div
        style={{
          height: 9,
          width: 80,
          background: "var(--color-bg-sunken)",
          borderRadius: 2,
          marginBottom: 10,
        }}
      />
      <div
        style={{
          height: 18,
          width: 140,
          background: "var(--color-bg-sunken)",
          borderRadius: 2,
          marginBottom: 16,
        }}
      />
      <div
        style={{
          height: 12,
          width: "100%",
          background: "var(--color-bg-sunken)",
          borderRadius: 2,
          marginBottom: 8,
        }}
      />
      <div
        style={{
          height: 12,
          width: "70%",
          background: "var(--color-bg-sunken)",
          borderRadius: 2,
        }}
      />
    </div>
  );
}
