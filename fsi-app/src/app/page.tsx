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
import { renderNowIso } from "@/lib/render-now";
import { buildDueNextRows, buildChangedRows, selectBriefResources } from "@/lib/dashboard/brief-rows";
import { enrichRowSourceChips } from "@/lib/supabase-server";

export default async function Home() {
  const [data, aggregates, surfaceCoverage] = await Promise.all([
    getAppData(),
    getWorkspaceAggregates(),
    getSurfaceCoverageSnapshot(),
  ]);

  // Rail's Watchlist card resolves inside its own Suspense boundary so the
  // masthead + band tiles + Due next / What changed paint at first-paint.
  const watchlistPromise = getWatchlist();

  // HYDRATION-59: one server instant (render-now.ts), UTC-pinned, threaded into every client
  // component on this route that renders a date — see that module for the two mismatch axes.
  const nowIso = renderNowIso();
  const dateStr = formatLocaleDate(new Date(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Defect D3 (2026-09-07): the two row sets are SELECTED here, on the server, so they can be
  // (a) derived from one fixed instant (no client clock in render — render-now.ts) and (b)
  // enriched with the same source-chip read /regulations runs, over ONLY the ≤11 rows this page
  // renders (bounded, F38/F39 — see enrichRowSourceChips). They then travel to <DashboardBrief/>
  // as ready ListRow field sets built by the SHARED derivation the list ledgers use
  // (src/lib/list-row-fields.ts), so one item cannot read "6/12 · T1" on /regulations and
  // "UNSCORED · not in primary source" here on the same load.
  const now = new Date(nowIso);
  await enrichRowSourceChips(selectBriefResources(data.resources, data.recentChanges, now));
  const dueNextRows = buildDueNextRows(data.resources, now);
  const changedRows = buildChangedRows(data.recentChanges, data.resources, now);

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
          nowIso={nowIso}
          itemCount={itemsCount}
          aggregatesLoaded={aggregates.totalItems > 0}
          totalJurisdictions={aggregates.totalJurisdictions}
        />
      </div>
      <DashboardBrief
        dueNextRows={dueNextRows}
        changedRows={changedRows}
        aggregates={aggregates}
        totalChanges={data.recentChanges.length}
        auditDate={data.auditDate}
        surfaceCoverage={surfaceCoverage}
        watchlistPromise={watchlistPromise}
        fetchError={data._error}
        nowIso={nowIso}
      />
    </>
  );
}
