/**
 * Dashboard home (`/`) — server component.
 *
 * UI system handoff 2026-09-06 (docs/design/handoff-2026-09-06, README
 * screen 1 / artboard 1 "Dashboard — Your brief"): masthead + command bar,
 * four band tiles, Due next, What changed; rail = Across the platform,
 * Watchlist, Legend. Assembled ONLY from the shared parts under
 * src/components/ui/ + <DashboardBrief/> — see that component's header.
 *
 * Supersedes the prior TEMPLATE 01 body (<HomeSurface/> + its priority
 * tiles/Ask bar/This-week/five-surfaces/Housekeeping sections, all deleted
 * this lane — the artboard does not carry those sections, and CLAUDE.md
 * rule 13 forbids leaving them as unreferenced dormant code). The
 * `getCoverageGaps`/`data.supersessions`/`data.changelog` reads those
 * sections used stay available on shared helpers other routes still use
 * (`/map` reads `getCoverageGaps` directly) — only this route's OWN use of
 * them is removed.
 *
 * COUNTS (binding): band tiles + the masthead's item count read the
 * workspace aggregates (migration 068) — never recomputed from the capped
 * row payload. The rail's per-surface counts read get_all_surface_counts
 * (migration 148) via getSurfaceCoverageSnapshot, fail-soft.
 */

import { getAppData, getWatchlist, getWorkspaceAggregates } from "@/lib/data";
import { getSurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { DashboardMasthead } from "@/components/dashboard/DashboardMasthead";
import { DashboardBrief } from "@/components/dashboard/DashboardBrief";
import { formatLocaleDate } from "@/lib/format";

export default async function Home() {
  const [data, aggregates, surfaceCoverage] = await Promise.all([
    getAppData(),
    getWorkspaceAggregates(),
    getSurfaceCoverageSnapshot(),
  ]);

  // Rail's Watchlist card resolves inside its own Suspense boundary so the
  // masthead + band tiles + Due next / What changed paint at first-paint.
  const watchlistPromise = getWatchlist();

  const dateStr = formatLocaleDate(new Date(), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // True workspace totals (migration 068), fail-soft to the row payload only
  // when aggregates report zero (anon / seed / RPC error).
  const itemsCount = aggregates.totalItems > 0 ? aggregates.totalItems : data.resources.length;

  return (
    <>
      {/* Mobile spec (MASTHEAD): the masthead's own 14px/16px padding is
          the mobile gutter — this wrapper's desktop 40px side padding
          would double it below 768 (theme.css's documented --bp-mobile),
          so it collapses to 0 there and the masthead card owns the inset. */}
      <style>{`
        @media (max-width: 767px) {
          .cl-dashboard-masthead-wrap { padding: 0 !important; }
        }
      `}</style>
      <div className="cl-dashboard-masthead-wrap" style={{ padding: "20px 40px 0" }}>
        <DashboardMasthead
          dateLabel={dateStr}
          itemCount={itemsCount}
          aggregatesLoaded={aggregates.totalItems > 0}
          totalJurisdictions={aggregates.totalJurisdictions}
        />
      </div>
      <DashboardBrief
        resources={data.resources}
        aggregates={aggregates}
        recentChanges={data.recentChanges}
        auditDate={data.auditDate}
        surfaceCoverage={surfaceCoverage}
        watchlistPromise={watchlistPromise}
        fetchError={data._error}
      />
    </>
  );
}
