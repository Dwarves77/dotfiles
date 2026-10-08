"use client";

/**
 * MarketPolicyTimeline: the Market policy timeline of spec 02 section 6 row 9 (lane MKT-1, operator ruling
 * 2026-10-08): dated, forward-looking obligations, filtered to the Market page's ACTIVE SCOPE.
 *
 * ACTIVE SCOPE = the ledger's URL facets `mode` and `region` when present, else the workspace profile's
 * transport modes and jurisdictions. This component reads the facets (the SAME contract the ledger writes,
 * useListSurfaceFilter's `filterFromSearchParams`, never a second parser) and hands them to the shared
 * UpcomingObligationsStrip as its optional `scope` prop; the profile fallback is resolved server-side by
 * GET /api/obligations/upcoming, which already owns the request-scoped client and the workspace read. The
 * strip then shows the filter as text ("Ocean, EU"), the count the scope hid ("N hidden by your scope") and
 * the one-click widen control (spec 00 section 4, "not filtered in").
 *
 * Regulations mounts the same strip WITHOUT a scope and renders exactly as before.
 *
 * Client component because it reads the URL; it renders inside the page's Suspense boundary so the route
 * keeps its static shell (the ledger above it needs the same boundary for the same hook).
 */

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { UpcomingObligationsStrip, type StripScope } from "@/components/regulations/UpcomingObligationsStrip";
import { filterFromSearchParams } from "@/components/list-surface/list-surface-helpers";

export function MarketPolicyTimeline() {
  const params = useSearchParams();
  const filter = useMemo(() => filterFromSearchParams(params), [params]);
  const scope: StripScope = useMemo(
    () => ({
      modes: filter.mode ? [filter.mode] : null,
      regions: filter.region ? [filter.region] : null,
    }),
    [filter.mode, filter.region],
  );
  return <UpcomingObligationsStrip variant="list" scope={scope} />;
}
