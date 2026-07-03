import { getOperationsItems, getResourcesOnly, getSurfaceCounts } from "@/lib/data";
import { fetchOperationsCoverage } from "@/lib/supabase-server";
import { OperationsPage } from "@/components/pages/OperationsPage";
import type { Resource } from "@/types/resource";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies
// returns null; runCategoryRpc early-returns empty (supabase-server.ts
// :1018-1020); static HTML bakes in total: 0 + seed fallback.
// Force-dynamic skips static generation so the page renders on request
// with the user's cookie-auth context, and category-routing RPCs see
// a real orgId.
export const dynamic = "force-dynamic";

// Build 9: regulation item_types per the canonical taxonomy in
// environmental-policy-and-innovation SKILL Section 3. Used to extract
// regulatory feasibility cross-references from the full workspace slim
// payload. caros-ledge-platform-intent SKILL Section 3 names regulatory
// feasibility by region as the first Operations capability; the content
// itself lives on /regulations, /operations links into it.
const REGULATION_ITEM_TYPES = new Set([
  "regulation",
  "directive",
  "standard",
  "guidance",
  "framework",
  "law",
]);

function isRegulationItem(r: Resource): boolean {
  return r.domain === 1 || (typeof r.type === "string" && REGULATION_ITEM_TYPES.has(r.type));
}

export default async function Operations() {
  const t0 = Date.now();
  // Sprint 2 Build 4: category routing wiring (OBS-26 / REC-OBS-G).
  // Previously this page received the unfiltered slim payload via
  // getResourcesOnly and shared its content with /market through the same
  // shape. getOperationsItems wraps get_operations_items
  // (source_role = 'statistical_data_agency') with skill Section 3
  // exception filtering (Carbon Trust + Project Drawdown excluded; those
  // route to Research). getResourcesOnly still runs in parallel as a
  // fallback so the surface is never blank when the category RPC is
  // empty (anon / misconfigured); it ALSO supplies the regulation cross-
  // references for Build 9's regulatory feasibility section.
  const [opsItems, fallback, aggregates, operationsCoverage] = await Promise.all([
    getOperationsItems(),
    getResourcesOnly(),
    // Count-integrity consistency close-out: operations-scoped counts from the single SoT
    // (migration 148), gated verified. Fails soft to scoped aggregates (069) over the
    // SURFACE_RULES-derived operations scope when the RPC is absent (pre-apply). Replaces
    // OPERATIONS_SCOPE — same pattern as /market and /research.
    getSurfaceCounts("operations"),
    // Sprint 3 A6.3 (2026-05-27): regions + coverage state + facts from
    // migrations 106 (regions + regional_data_facts) and 109
    // (region_dimension_coverage). Empty arrays when not configured.
    fetchOperationsCoverage(),
  ]);
  console.log(
    `[perf] /operations data ${Date.now() - t0}ms (category-routed=${opsItems.total}, fallback=${fallback.resources.length}, coverage_rows=${operationsCoverage.coverage.length}, fact_rows=${operationsCoverage.facts.length})`
  );
  // Fail CLOSED: the ops item list is ONLY the item_type-gated RPC result; never fall through to
  // the ungated seed on RPC error/empty. (fallback/getResourcesOnly is still fetched above — it
  // legitimately supplies the regulation cross-references at regulationsByRegion below, NOT this list.)
  const initialResources = opsItems.resources;

  // Build 9 Priority 1: regulatory feasibility by region. Cross-references
  // regulation items from the full workspace payload, grouped per-region
  // by the OperationsPage. Source-of-truth content lives on /regulations;
  // /operations links into it. Per caros-ledge-platform-intent SKILL
  // Section 3 binding framing, this is structured content, NOT a separate
  // decision-engine UI (OBS-29).
  const regulationsByRegion = fallback.resources.filter(isRegulationItem);

  return (
    <OperationsPage
      initialResources={initialResources}
      aggregates={aggregates}
      regulationsByRegion={regulationsByRegion}
      operationsCoverage={operationsCoverage}
    />
  );
}
