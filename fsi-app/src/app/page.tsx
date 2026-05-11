/**
 * Dashboard home (`/`) — server component.
 *
 * Renders the editorial masthead + 4-up DashboardHero strip on the server,
 * then mounts <HomeSurface> for the client-state sections (Weekly Briefing,
 * What Changed, Supersessions). Replaces the previous Dashboard.tsx
 * delegation (case "home").
 *
 * Layout per design_handoff_2026-04/preview/dashboard-v3.html:
 *   - <EditorialMasthead> with title="Dashboard — Your Brief"
 *   - DashboardHero rendered inside the masthead's belowSlot for the 4-up
 *     critical/high/moderate/low tiles
 *   - AiPromptBar with chip suggestions
 *   - "This Week" section: WeeklyBriefing (1.3fr) | WhatChanged (1fr)
 *   - "Replaced" section: 5-up horizontal Supersessions strip
 */

import {
  getAppData,
  getWatchlist,
  getCoverageGaps,
  getAwaitingReview,
  getWorkspaceAggregates,
} from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { DashboardHero } from "@/components/home/DashboardHero";
import { HomeSurface } from "@/components/home/HomeSurface";

// Note: previous `export const revalidate = 60` was a no-op — getAppData()
// reads cookies via resolveOrgIdFromCookies(), which forces dynamic
// rendering and disables ISR. ISR-friendly anon/authed split is tracked
// in docs/PERF-WAVE-2.md as a Phase D item.

export default async function Home() {
  const t0 = Date.now();
  // Fetch the dashboard payload and the scalar aggregates (migration 068)
  // in parallel. The dashboard payload caps at LIMIT 50 — useful for the
  // top-N row rendering — but the masthead meta, the four DashboardHero
  // tiles, and the WeeklyBriefing summary need true workspace totals.
  // Aggregates ride the same APP_DATA_TAG cache so override mutations
  // invalidate both in lockstep.
  const [data, aggregates] = await Promise.all([
    getAppData(),
    getWorkspaceAggregates(),
  ]);
  console.log(`[perf] / data ${Date.now() - t0}ms`);

  // Phase 3 widget data — kicked off as unawaited promises so the
  // editorial body and hero paint at the original time-to-first-paint
  // and the rail / Housekeeping resolve as their independent queries
  // return inside Suspense boundaries.
  const watchlistPromise = getWatchlist();
  const coverageGapsPromise = getCoverageGaps();
  const awaitingReviewPromise = getAwaitingReview();

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  // Counts read from aggregates (true totals across the workspace's active
  // row set) instead of the capped row array. Falls back to the row-derived
  // values when aggregates are zero (Supabase unconfigured / RPC error /
  // anon caller) so the seed-fallback path still renders sensible numbers.
  const jurisdictionsCount =
    aggregates.totalJurisdictions > 0
      ? aggregates.totalJurisdictions
      : new Set(data.resources.map((r) => r.jurisdiction || "global")).size;
  const itemsCount =
    aggregates.totalItems > 0 ? aggregates.totalItems : data.resources.length;
  const meta = `${dateStr} · ${itemsCount} regulations tracked · ${jurisdictionsCount} jurisdictions`;

  return (
    <>
      <EditorialMasthead
        title="Dashboard — Your Brief"
        meta={meta}
        belowSlot={
          <DashboardHero
            resources={data.resources}
            aggregates={aggregates}
          />
        }
      />
      <HomeSurface
        initialResources={data.resources}
        initialArchived={data.archived}
        changelog={data.changelog}
        disputes={data.disputes}
        supersessions={data.supersessions}
        auditDate={data.auditDate}
        initialOverrides={data.overrides}
        aggregates={aggregates}
        watchlistPromise={watchlistPromise}
        coverageGapsPromise={coverageGapsPromise}
        awaitingReviewPromise={awaitingReviewPromise}
      />
    </>
  );
}
