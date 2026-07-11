"use client";

/**
 * HomeSurface — the Dashboard body (TEMPLATE 01, HANDOFF §6.3 + "Pages - 01
 * Dashboard" mock). Client component: hydrates the resource store (scoring
 * with sector context), then lays out the mock's information architecture:
 *
 *   Priority tiles → Ask bar → THIS WEEK (top-priority list + rail:
 *   surfaces / watchlist / by owner) → WHAT CHANGED (date-stamped bar +
 *   REPLACED ledger) → HOUSEKEEPING (coverage gaps + awaiting review).
 *
 * The masthead (VOL eyebrow + Anton title + counts sub-line) lives in the
 * server component (app/page.tsx). Section headers, tiles, and the Ask bar
 * live here in the body per the mock.
 *
 * Bindings honored: counts come from server aggregates / snapshots (never
 * recomputed from visible rows); honest-state frames for every absent field;
 * the What-changed half stays date-stamped (never implies live detection);
 * superseded items render in their own ledger, never mixed into active lists.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DashboardHero } from "@/components/home/DashboardHero";
import { DashboardAskBar } from "@/components/home/DashboardAskBar";
import { DashboardTopPriority } from "@/components/home/DashboardTopPriority";
import { DashboardSurfaceCoverage } from "@/components/home/DashboardSurfaceCoverage";
import { DashboardWatchlist } from "@/components/home/DashboardWatchlist";
import { DashboardByOwner } from "@/components/home/DashboardByOwner";
import { DashboardCoverageGaps } from "@/components/home/DashboardCoverageGaps";
import { DashboardAwaitingReview } from "@/components/home/DashboardAwaitingReview";
import { WhatChanged } from "@/components/home/WhatChanged";
import { Supersessions } from "@/components/home/Supersessions";
import type { SurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { urgencyScore, scoreResource } from "@/lib/scoring";
import type { Resource, ChangeLogEntry, Supersession } from "@/types/resource";
import type { WatchlistItem, CoverageGap, ReviewItem, WorkspaceAggregates } from "@/lib/data";

interface HomeSurfaceProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  supersessions: Supersession[];
  auditDate: string;
  initialOverrides?: {
    itemId: string;
    priorityOverride: string | null;
    isArchived: boolean;
    archiveReason: string | null;
    archiveNote: string | null;
    notes: string;
  }[];
  aggregates: WorkspaceAggregates;
  jurisdictionsCount: number;
  watchlistPromise: Promise<WatchlistItem[]>;
  coverageGapsPromise: Promise<CoverageGap[]>;
  awaitingReviewPromise: Promise<ReviewItem[]>;
  surfaceCoverage: SurfaceCoverageSnapshot;
}

/** Section rule per the mock: Anton title + right eyebrow + 2px ink underline. */
function SectionHeading({ title, aside, style }: { title: string; aside: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        borderBottom: "2px solid var(--color-text-primary)",
        padding: "0 0 8px",
        gap: 12,
        ...style,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 26,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {title}
      </h2>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {aside}
      </span>
    </div>
  );
}

export function HomeSurface({
  initialResources,
  initialArchived,
  changelog,
  supersessions,
  auditDate,
  initialOverrides = [],
  aggregates,
  jurisdictionsCount,
  watchlistPromise,
  coverageGapsPromise,
  awaitingReviewPromise,
  surfaceCoverage,
}: HomeSurfaceProps) {
  const {
    resources: platformResources,
    archived: platformArchived,
    setResources,
    setArchived,
    overrides,
    setOverrides,
  } = useResourceStore();
  const sectorProfile = useWorkspaceStore((s) => s.sectorProfile);
  const sectorWeights = useWorkspaceStore((s) => s.sectorWeights);
  const jurisdictionWeights = useWorkspaceStore((s) => s.jurisdictionWeights);

  useEffect(() => {
    const sectorCtx = { activeSectors: sectorProfile, sectorWeights };
    const scored = initialResources.map((r) => ({
      ...r,
      urgencyScore: urgencyScore(r, jurisdictionWeights, sectorCtx),
      impactScores: scoreResource(r),
    }));
    setResources(scored);
    setArchived(initialArchived);
    if (initialOverrides.length > 0) setOverrides(initialOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResources, initialArchived]);

  const effectiveResources = platformResources.length > 0 ? platformResources : initialResources;
  const effectiveArchived = platformArchived.length > 0 ? platformArchived : initialArchived;
  const { active: resources, archived: workspaceArchived } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides),
    [effectiveResources, overrides]
  );
  const archived = useMemo(
    () => [...effectiveArchived, ...workspaceArchived],
    [effectiveArchived, workspaceArchived]
  );

  const resourceMap = useMemo(() => {
    const map = new Map<string, Resource>();
    resources.forEach((r) => map.set(r.id, r));
    archived.forEach((r) => map.set(r.id, r));
    return map;
  }, [resources, archived]);

  // Pending live-filter plumbing (DISABLED — DashboardHero.TILES_AS_LIVE_FILTERS
  // is false). State is wired so activation is a one-line flip after operator
  // approval (HANDOFF §9). Until then the setter is unused by design.
  const [, setBandFilter] = useState<string | null>(null);

  // V-07 (2026-07-11): "today" is now-based and locale/timezone-dependent, so computing it during
  // render mismatches between SSR and hydration (React #418). Render it client-only after mount —
  // the server and first client render both omit it, so the two agree.
  const [briefingDate, setBriefingDate] = useState("");
  useEffect(() => {
    setBriefingDate(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 80px" }}>
      {/* Priority tiles */}
      <DashboardHero resources={resources} aggregates={aggregates} onSelectBand={(b) => setBandFilter(b)} />

      {/* Ask bar */}
      <DashboardAskBar />

      {/* THIS WEEK */}
      <SectionHeading title="This week" aside={briefingDate ? `Weekly briefing · ${briefingDate}` : "Weekly briefing"} style={{ margin: "0 0 18px" }} />
      <div
        className="cl-dash-thisweek"
        style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}
      >
        <style>{`
          @media (max-width: 900px) {
            .cl-dash-thisweek { grid-template-columns: 1fr !important; }
            .cl-dash-housekeeping { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <DashboardTopPriority resources={resources} jurisdictionsCount={jurisdictionsCount} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DashboardSurfaceCoverage snapshot={surfaceCoverage} />
          <Suspense fallback={null}>
            <DashboardWatchlist promise={watchlistPromise} />
          </Suspense>
          <DashboardByOwner resources={resources} />
        </div>
      </div>

      {/* WHAT CHANGED */}
      <SectionHeading
        title="What changed"
        aside="Change log across the registry"
        style={{ margin: "44px 0 16px" }}
      />
      <WhatChanged resources={resources} changelog={changelog} auditDate={auditDate} />
      <Supersessions supersessions={supersessions} resourceMap={resourceMap} />

      {/* HOUSEKEEPING */}
      <SectionHeading
        title="Housekeeping"
        aside="Registry health · review queue"
        style={{ margin: "44px 0 16px" }}
      />
      <div
        className="cl-dash-housekeeping"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}
      >
        <Suspense fallback={null}>
          <DashboardCoverageGaps promise={coverageGapsPromise} />
        </Suspense>
        <Suspense fallback={null}>
          <DashboardAwaitingReview promise={awaitingReviewPromise} />
        </Suspense>
      </div>
    </div>
  );
}
