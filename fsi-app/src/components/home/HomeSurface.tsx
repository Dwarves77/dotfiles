"use client";

/**
 * HomeSurface — the Dashboard body (TEMPLATE 01, HANDOFF §6.3 + "Pages - 01
 * Dashboard" mock). Client component: hydrates the resource store (scoring
 * with sector context), then lays out the mock's information architecture:
 *
 *   Priority tiles → Ask bar → THIS WEEK (top-priority list + rail:
 *   surfaces / watchlist / by owner) → WHAT CHANGED (source/theme strip +
 *   date-stamped bar + REPLACED ledger; ONE section) → HOUSEKEEPING (coverage gaps + awaiting review).
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
import { WhatChanged } from "@/components/home/WhatChanged";
import { Supersessions } from "@/components/home/Supersessions";
import type { SurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { useResourceStore, mergeWithOverrides } from "@/stores/resourceStore";
import { usePersonalStateHydration } from "@/lib/hooks/usePersonalState";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { urgencyScore, scoreResource } from "@/lib/scoring";
import type { Resource, ChangeLogEntry, Supersession } from "@/types/resource";
import type { WatchlistItem, CoverageGap, WorkspaceAggregates } from "@/lib/data";

interface HomeSurfaceProps {
  initialResources: Resource[];
  initialArchived: Resource[];
  /** Window-scoped What-changed feed (get_workspace_recent_changes) — NOT
   *  derived from the LIMIT-50 dashboard slice. See RecentChangeRow. */
  recentChanges: import("@/lib/supabase-server").RecentChangeRow[];
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
  surfaceCoverage: SurfaceCoverageSnapshot;
  /** Server-rendered <ChangedSinceStrip/> (src/components/dashboard/ChangedSinceStrip.tsx) — source-
   *  changed / theme-membership-changed, distinct from the item_changelog-driven WhatChanged below.
   *  Rendered by the server parent (app/page.tsx) and passed down as an element: HomeSurface is a Client
   *  Component and cannot import an async Server Component directly. */
  changedSinceStrip?: ReactNode;
  /** Five-surface rebalance (Lane DASH, 2026-09-02): the four NEW first-class per-surface blocks,
   *  each a server-rendered async component (src/components/dashboard/*Pulse.tsx) fed by its own
   *  live read, passed down as elements for the same reason changedSinceStrip is — see
   *  SurfacePulseCard.tsx's header for why Regulations does not get a fifth card here. */
  marketIntelPulse?: ReactNode;
  researchPulse?: ReactNode;
  operationsPulse?: ReactNode;
  communityPulse?: ReactNode;
}

/** Section rule per the mock: Anton title + right eyebrow + 2px ink underline.
 *
 * ROOT CAUSE (screenshots 06-home-what-changed / 07-home-five-surfaces, confirmed): the aside
 * carried `whiteSpace: nowrap` with no max-width and no minWidth:0 on either flex child. At 375px
 * the aside's forced-nowrap subtitle ("Source and theme monitoring, change log across the
 * registry") claimed its own full text width as its flex minimum, leaving the title only its
 * longest single word — "WHAT" / "CHANGED" stacked — while the subtitle itself ran off the right
 * edge (visible overflow, no wrap, no ellipsis). The subtitle is prose, not a chip or a bounded
 * figure, so nowrap is wrong for it outright: it now wraps like any other text, and `.cl-section-
 * head` (globals.css) stacks the two lines at ≤640px instead of squeezing them onto one row. */
function SectionHeading({ title, aside, style }: { title: string; aside: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="cl-section-head"
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
        data-guard-title
        className="cl-section-head__title"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 400,
          fontSize: 26,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          margin: 0,
          minWidth: 0,
        }}
      >
        {title}
      </h2>
      <span
        className="cl-section-head__aside"
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          minWidth: 0,
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
  recentChanges,
  changelog,
  supersessions,
  auditDate,
  initialOverrides = [],
  aggregates,
  jurisdictionsCount,
  watchlistPromise,
  coverageGapsPromise,
  surfaceCoverage,
  changedSinceStrip,
  marketIntelPulse,
  researchPulse,
  operationsPulse,
  communityPulse,
}: HomeSurfaceProps) {
  const {
    resources: platformResources,
    archived: platformArchived,
    setResources,
    setArchived,
    overrides,
    setOverrides,
    personalState,
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

  // Personal archive layer (migration 235). The override layer above arrives
  // with the SSR payload; user_item_state is per-user so it is fetched here.
  usePersonalStateHydration();

  const effectiveResources = platformResources.length > 0 ? platformResources : initialResources;
  const effectiveArchived = platformArchived.length > 0 ? platformArchived : initialArchived;
  const { active: resources, archived: workspaceArchived } = useMemo(
    () => mergeWithOverrides(effectiveResources, overrides, personalState),
    [effectiveResources, overrides, personalState]
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

      {/* ACROSS YOUR FIVE SURFACES (Lane DASH, 2026-09-02: dashboard five-surface rebalance,
          docs/specs/00-foundation-the-spine.md "five lenses on one spine" + docs/specs/07-page-
          walkthrough.md "HOW THE FIVE FIT TOGETHER"). Regulations already got first-class, real-data
          treatment above (This week's top-priority list + By owner), so this section adds the four
          surfaces that previously had only the thin "Across the platform" count-and-link rail card:
          Market Intel, Research, Operations, Community — each block fed by its own live read (see
          each Pulse component's header), never a placeholder. The Watchlist rail card above is the
          cross-cutting lens across all five (its rows already span reg/signal/research/operations/
          source types, per DashboardWatchlist.tsx) — named here rather than duplicated. */}
      <SectionHeading
        title="Across your five surfaces"
        aside="Your watchlist above is the lens that spans all five"
        style={{ margin: "44px 0 16px" }}
      />
      <div
        className="cl-dash-surfaces"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, margin: "0 0 8px" }}
      >
        <style>{`
          @media (max-width: 1100px) { .cl-dash-surfaces { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (max-width: 560px) { .cl-dash-surfaces { grid-template-columns: 1fr !important; } }
        `}</style>
        {marketIntelPulse}
        {researchPulse}
        {operationsPulse}
        {communityPulse}
      </div>

      {/* WHAT CHANGED — one section (operator ruling 2026-09-02: "we only need one"). The source-changed /
          theme-membership-changed strip (its own pipeline and cadence, ChangedSinceStrip.tsx) renders
          first, under its own sub-headings, then the item_changelog-driven WhatChanged and the REPLACED
          ledger. Two headings for one question was the defect; the data paths are unchanged. */}
      <SectionHeading
        title="What changed"
        aside="Source and theme monitoring, change log across the registry"
        style={{ margin: "44px 0 16px" }}
      />
      {changedSinceStrip && <div style={{ marginBottom: 20 }}>{changedSinceStrip}</div>}
      <WhatChanged resources={resources} recentChanges={recentChanges} changelog={changelog} auditDate={auditDate} />
      <Supersessions supersessions={supersessions} resourceMap={resourceMap} />

      {/* HOUSEKEEPING */}
      <SectionHeading
        title="Housekeeping"
        aside="Registry health"
        style={{ margin: "44px 0 16px" }}
      />
      <div
        className="cl-dash-housekeeping"
        style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, alignItems: "start" }}
      >
        <Suspense fallback={null}>
          <DashboardCoverageGaps promise={coverageGapsPromise} />
        </Suspense>
      </div>
    </div>
  );
}
