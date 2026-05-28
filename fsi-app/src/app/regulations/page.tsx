/**
 * Regulations index (`/regulations`) — server component.
 *
 * Replaces the previous Dashboard.tsx delegation (case "regulations").
 * Fetches data via getResourcesOnly() (slim fetcher — only resources +
 * overrides, no changelog/disputes/xrefs/supersessions/synopses) and
 * composes:
 *   - <EditorialMasthead> with title="Regulations", meta="<n> tracked · <j>
 *     jurisdictions · last sync ~"
 *   - <DashboardHero> 4-up tile strip in the masthead's belowSlot
 *   - <RegulationsSurface> client component for AI bar, search, chip
 *     filters, and the 4-column priority kanban.
 *
 * Layout matches design_handoff_2026-04/preview/regulations.html.
 */

import { getListingsOnly, getScopedWorkspaceAggregates } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { DashboardHero } from "@/components/home/DashboardHero";
import { RegulationsSurface } from "@/components/regulations/RegulationsSurface";
import { toDate } from "@/lib/relative-time";
import { REGULATIONS_DOMAIN } from "@/lib/domains";

// Phase 2A (2026-05-25): scope filter mirrors the page-scope intent
// (workspace-wide active regulations). Matches the SCOPE constants used on
// /market /research /operations. Replaces the ad-hoc cachedPlatformTotal
// inline COUNT query so /regulations consumes the same RPC the other
// surfaces use, keeping cross-surface count derivation in lockstep.
const REGULATIONS_SCOPE = {
  domains: [REGULATIONS_DOMAIN],
};

export default async function RegulationsPage({
  searchParams,
}: {
  // PR-N (Wave 5): `?region=us-ca` accepts any Tier 1 ISO code (case-
  // insensitive), filtering the kanban / list / table to items whose
  // `jurisdictionIso[]` array contains that code. Composes with
  // `?priority=critical` (already supported) so dashboard tile +
  // sub-national deep links can chain (`/regulations?region=us-ca&priority=critical`).
  searchParams: Promise<{ priority?: string; region?: string }>;
}) {
  const t0 = Date.now();
  const { priority: priorityParam, region: regionParam } = await searchParams;
  // Listings RPC (066): drops `summary` on top of slim. Resource.note arrives
  // empty here. RegulationsSurface only ever read r.note inside the search
  // hay-stack (no card body reference), and that contribution is removed in
  // this PR so search semantics stay consistent (titles, tags, whatIsIt,
  // whyMatters, jurisdiction continue to participate).
  // Phase 2A wire: source-of-truth count via the scoped aggregates RPC
  // (migration 069). Replaces the cachedPlatformTotal one-off COUNT.
  const [data, aggregates] = await Promise.all([
    getListingsOnly(),
    getScopedWorkspaceAggregates(REGULATIONS_SCOPE),
  ]);
  const platformTotal = aggregates.totalItems || null;

  console.log(`[perf] /regulations data ${Date.now() - t0}ms`);

  // Hotfix 2026-05-22 (Issues 1 + 2 in /regulations report): the listings
  // RPC returns all resources across all domains. The /regulations
  // surface, masthead meta, and DashboardHero tiles must all bucket the
  // same regulation-only subset, not the raw 645 that mixed in 57
  // non-regulation items.
  //
  // The strict comparison (vs `r.domain || 1 === 1`) is defensive
  // prophylaxis only at this point: the post-hotfix DB query showed
  // zero NULL-domain items, so coercion was not the live cause of the
  // leakage. The live cause is items with item_type=market_signal AND
  // domain=1 (ingest classifier bug); see dispatch E.
  const regulationResources = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);

  const jurisdictionsCount = new Set(
    regulationResources.map((r) => r.jurisdiction || "global")
  ).size;
  // "Last sync" = most recent resource added to the platform. Resource.added
  // is the ingestion timestamp (Supabase added_date column). If no resources
  // or all timestamps are unparseable, omit the segment rather than show a
  // hardcoded value.
  const mostRecentAdded = regulationResources
    .map((r) => toDate(r.added))
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((acc, d) => (acc === null || d > acc ? d : acc), null);
  // Phase 1 Fix 7 reconciliation (2026-05-24): absolute date format
  // for "last sync". Prior commit used formatRelative which produced
  // "last sync 2 weeks ago", a relative string that doesn't move with
  // time. Spec calls for an actual date the operator can act on.
  const syncSegment = mostRecentAdded
    ? ` · last sync ${mostRecentAdded.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
    : "";
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Phase 2A: masthead count from aggregates RPC (workspace-wide active
  // regulations). regulationResources.length is the LIMIT-50-derived in-view
  // count — kept available for the DashboardHero tile, masthead uses true
  // total. Falls back to length if aggregates returned 0.
  const activeRegulationsCount = aggregates.totalItems || regulationResources.length;
  const meta = `${today} · ${activeRegulationsCount} active regulations · ${jurisdictionsCount} jurisdictions${syncSegment} · workspace verticals: Live events · Fine art`;

  return (
    <>
      <SystemErrorBanner message={data._error} />
      <EditorialMasthead
        title="Regulations"
        meta={meta}
        belowSlot={<DashboardHero resources={regulationResources} />}
      />
      <RegulationsSurface
        initialResources={data.resources}
        initialArchived={data.archived}
        initialOverrides={data.overrides}
        platformTotal={platformTotal}
        initialPriorityFilter={priorityParam ?? null}
        initialRegionFilter={regionParam ?? null}
      />
    </>
  );
}
