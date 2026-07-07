/**
 * Dashboard home (`/`) — server component.
 *
 * Redesign TEMPLATE 01 (HANDOFF §6.3 + "Pages - 01 Dashboard" mock). Renders
 * the editorial masthead (VOL eyebrow + Anton title + counts sub-line) on the
 * server, then mounts <HomeSurface> for the mock body (priority tiles → Ask bar
 * → This week → What changed → Housekeeping).
 *
 * COUNTS (binding): the masthead sub-line reads the workspace aggregates
 * (migration 068) for the true item + jurisdiction totals — never recomputed
 * from the capped row payload, never the mock snapshot literals. The rail's
 * per-surface counts read get_all_surface_counts (migration 148) via
 * getSurfaceCoverageSnapshot, fail-soft.
 */

import {
  getAppData,
  getWatchlist,
  getCoverageGaps,
  getAwaitingReview,
  getWorkspaceAggregates,
} from "@/lib/data";
import { getSurfaceCoverageSnapshot } from "@/lib/dashboard/surface-coverage";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { HomeSurface } from "@/components/home/HomeSurface";

export default async function Home() {
  const [data, aggregates, surfaceCoverage] = await Promise.all([
    getAppData(),
    getWorkspaceAggregates(),
    getSurfaceCoverageSnapshot(),
  ]);

  // Phase 3 widget data — kicked off as unawaited promises so the editorial
  // body paints at first-paint and the rail / Housekeeping resolve inside
  // Suspense boundaries as their independent queries return.
  const watchlistPromise = getWatchlist();
  const coverageGapsPromise = getCoverageGaps();
  const awaitingReviewPromise = getAwaitingReview();

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // True workspace totals (migration 068), fail-soft to the row payload only
  // when aggregates report zero (anon / seed / RPC error).
  const jurisdictionsCount =
    aggregates.totalJurisdictions > 0
      ? aggregates.totalJurisdictions
      : new Set(data.resources.map((r) => r.jurisdiction || "global")).size;
  const itemsCount =
    aggregates.totalItems > 0 ? aggregates.totalItems : data.resources.length;

  const boldInk = { fontWeight: 800, color: "var(--color-text-primary)" } as const;
  const meta = (
    <span>
      {dateStr} · <span style={boldInk}>{itemsCount}</span> intelligence items across 5 surfaces ·{" "}
      <span style={boldInk}>{jurisdictionsCount}</span> jurisdictions
    </span>
  );

  return (
    <>
      <SystemErrorBanner message={data._error} />
      <EditorialMasthead title="Dashboard — Your brief" meta={meta} />
      <HomeSurface
        initialResources={data.resources}
        initialArchived={data.archived}
        changelog={data.changelog}
        supersessions={data.supersessions}
        auditDate={data.auditDate}
        initialOverrides={data.overrides}
        aggregates={aggregates}
        jurisdictionsCount={jurisdictionsCount}
        watchlistPromise={watchlistPromise}
        coverageGapsPromise={coverageGapsPromise}
        awaitingReviewPromise={awaitingReviewPromise}
        surfaceCoverage={surfaceCoverage}
      />
    </>
  );
}
