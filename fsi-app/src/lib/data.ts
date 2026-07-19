import { unstable_cache } from "next/cache";
import {
  fetchDashboardData,
  fetchResourcesOnly,
  fetchListingsOnly,
  fetchMapData,
  fetchListingsMapData,
  fetchSettingsData,
  fetchWatchlist,
  fetchCoverageGaps,
  fetchAwaitingReview,
  fetchWorkspaceAggregates,
  fetchWorkspaceAggregatesScoped,
  fetchSurfaceCounts,
  fetchMarketIntelItems,
  fetchResearchItems,
  fetchOperationsItems,
  fetchTechnologyItems,
  fetchSourceCitationStatsByIds,
  fetchResearchSourceCoverage,
  SEED_FALLBACK_ERROR,
  type ScopeFilter,
  type CategoryRoutedResult,
  type SourceCitationStat,
  type ResearchSourceCoverageCell,
} from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { scopeFilterForSurface } from "@/lib/surface-of.mjs";
import {
  recordSeedFallbackFlag,
  type SeedFallbackTrigger,
} from "@/lib/notifications/seed-fallback-flag";
import type { Resource, ChangeLogEntry, Dispute, Supersession } from "@/types/resource";
import { AUDIT_DATE } from "@/data/audit-date";
import type {
  WorkspaceOverrideRow,
  WatchlistItem,
  CoverageGap,
  ReviewItem,
  WorkspaceAggregates,
} from "@/lib/supabase-server";

// SF-2 Phase 1 (2026-05-27): helper to dispatch a platform integrity_flag
// when a fetcher returns the empty + _error sentinel. Fire-and-forget so
// it doesn't add latency to the already-degraded response. Helper is
// dedup'd internally (one open flag per surface per hour).
function alertIfFallback(
  data: { _error?: string; _fallbackTrigger?: SeedFallbackTrigger },
  route: string
): void {
  if (data._error && data._fallbackTrigger) {
    void recordSeedFallbackFlag(data._fallbackTrigger, route);
  }
}

// Re-export the Phase 3 widget types so HomeSurface and the widget files
// can import them from a single module rather than reaching into
// supabase-server directly.
export type { WatchlistItem, CoverageGap, ReviewItem, WorkspaceAggregates, ScopeFilter, CategoryRoutedResult };

/**
 * Cache invalidation tag for workspace data. Mutation routes
 * (api/workspace/overrides, and the machine intake cycle's materialization) call
 * `revalidateTag(APP_DATA_TAG)` so users see their changes immediately
 * instead of waiting up to 60s for the cache to refresh.
 */
export const APP_DATA_TAG = "app-data";

/**
 * Cached inner getAppData. The cookies-read happens OUTSIDE this
 * function (in getAppData below); only the resolved orgId enters as a
 * function argument and becomes part of the cache key.
 *
 * Anonymous users (orgId=null) and authed users without org membership
 * share one cache key — they all see the seed fallback shape.
 *
 * 60s TTL bounds staleness; revalidateTag(APP_DATA_TAG) from mutation
 * routes invalidates immediately on user-driven changes.
 */
const cachedAppData = unstable_cache(
  async (orgId: string | null) => {
    // Sprint 3 E1 (2026-05-25): dropped fetchSourceData from the
    // getAppData merge. The Dashboard home tree + src/app/page.tsx do
    // not consume data.sources / data.provisionalSources /
    // data.openConflicts (grep-verified). Sources are loaded directly
    // by /admin via app/admin/page.tsx → AdminDashboard.initialSources
    // → useSourceStore.setSources. Keeping sources in getAppData was
    // burning the 2 MB Next.js cache limit (sources alone = 1.8 MB
    // from select("*") on 725 rows; provisional_sources another 313 KB).
    // Removing them saves ~2.1 MB and gets the cache payload back under
    // the 2 MB threshold.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getAppData timeout")), 10000)
    );
    const dashboardData = await Promise.race([
      fetchDashboardData(orgId),
      timeout.then(() => {
        throw new Error("timeout");
      }),
    ]);
    return dashboardData;
  },
  ["app-data-v2"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

// SF-2 Phase 1 (2026-05-27): retained as an empty-shape factory rather
// than a seed-data fallback. Old name preserved to minimize diff
// breadth; behavior changed: no seed resources returned.
function appDataSeedFallback(_fallbackTrigger?: SeedFallbackTrigger) {
  // T7 (2026-07-12): was `await import("@/data")`, which bundled the 1.23 MB seed-resources.json into an async
  // chunk to read ONE constant (AUDIT_DATE) while returning all-empty arrays. Now a static AUDIT_DATE + the
  // real types; the src/data barrel (its only importer was here) drops out of the client bundle entirely.
  return {
    resources: [] as Resource[],
    archived: [] as Resource[],
    changelog: {} as Record<string, ChangeLogEntry[]>,
    disputes: {} as Record<string, Dispute>,
    xrefPairs: [] as [string, string][],
    supersessions: [] as Supersession[],
    auditDate: AUDIT_DATE,
    synopses: [],
    intelligenceChanges: [],
    sectorDisplayNames: [],
    overrides: [],
    _error: SEED_FALLBACK_ERROR,
    _fallbackTrigger: _fallbackTrigger ?? ("exception" as SeedFallbackTrigger),
  };
}

/**
 * Shared data fetching for all pages.
 *
 * Resolves orgId from auth cookies (uncacheable — cookies opt the page
 * into dynamic rendering) and then calls a cached inner fetcher keyed by
 * orgId. The 9-query data path now runs at most once per minute per
 * workspace; subsequent renders within the TTL hit the Vercel data
 * cache (~5ms) instead of round-tripping to Supabase.
 *
 * Falls back to seed data on timeout / error so the page still renders.
 */
export async function getAppData() {
  const t0 = Date.now();
  try {
    const orgId = await resolveOrgIdFromCookies();
    const data = await cachedAppData(orgId);
    console.log(`[perf] getAppData ${Date.now() - t0}ms`);
    alertIfFallback(data, "/");
    return data;
  } catch (e) {
    console.error("getAppData failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/");
    return appDataSeedFallback("exception");
  }
}

/**
 * Slim fetcher: only resources + overrides. Used by pages that consume
 * `data.resources` (and optionally `data.overrides`) but not the heavy
 * dashboard payload (changelog, disputes, xrefs, supersessions, synopses,
 * intelligence changes, sector names, sources).
 *
 * Runs the workspace RPC + workspace_item_overrides only. ~2 queries
 * vs. ~15 for getAppData(). Falls back to seed resources on failure.
 *
 * Used by: /operations, /market, /regulations index.
 */
export async function getResourcesOnly(): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getResourcesOnly timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchResourcesOnly(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getResourcesOnly ${Date.now() - t0}ms`);
    // SF-2 Phase 1: route-agnostic since this fetcher serves multiple
    // surfaces (/operations, /market). Use the generic surface ref.
    alertIfFallback(result, "/operations|/market");
    return result;
  } catch (e) {
    console.error("getResourcesOnly failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/operations|/market");
    return {
      resources: [],
      archived: [],
      overrides: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

/**
 * Listings fetcher: resources + overrides via the listings RPC (066),
 * which additionally drops `summary` on top of slim. Resource.note arrives
 * empty on every row.
 *
 * Used by: /regulations (card body never renders r.note; the search
 * hay-stack stops contributing the empty value, no functional regression).
 *
 * /market and /operations DO render r.note on cards and stay on
 * getResourcesOnly until those cards are refactored or per-route summary
 * retention is added. See migration 066 header.
 */
export async function getListingsOnly(): Promise<{
  resources: Resource[];
  archived: Resource[];
  overrides: WorkspaceOverrideRow[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getListingsOnly timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchListingsOnly(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getListingsOnly ${Date.now() - t0}ms`);
    alertIfFallback(result, "/regulations");
    return result;
  } catch (e) {
    console.error("getListingsOnly failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/regulations");
    return {
      resources: [],
      archived: [],
      overrides: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

/**
 * Slim fetcher for /map: resources + the relationship payload the map
 * surface needs (changelog, disputes, xrefPairs, supersessions). Drops
 * sources, provisional sources, conflicts, synopses, intelligence
 * changes, sector display names, and overrides.
 *
 * Used by: /map.
 */
export async function getMapData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getMapData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchMapData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getMapData ${Date.now() - t0}ms`);
    alertIfFallback(result, "/map");
    return result;
  } catch (e) {
    console.error("getMapData failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/map");
    return {
      resources: [],
      archived: [],
      changelog: {},
      disputes: {},
      xrefPairs: [],
      supersessions: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

/**
 * Listings fetcher for /map: resources + relationship payload, but via the
 * listings RPC (066) which additionally drops `summary` on top of slim.
 * Resource.note arrives empty on every row. Safe for /map per the
 * 2026-05-10 audit (no MapPageView / MapView reference to r.note).
 */
export async function getListingsMapData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  changelog: Record<string, ChangeLogEntry[]>;
  disputes: Record<string, Dispute>;
  xrefPairs: [string, string][];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getListingsMapData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchListingsMapData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getListingsMapData ${Date.now() - t0}ms`);
    alertIfFallback(result, "/map");
    return result;
  } catch (e) {
    console.error("getListingsMapData failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/map");
    return {
      resources: [],
      archived: [],
      changelog: {},
      disputes: {},
      xrefPairs: [],
      supersessions: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

/**
 * Slim fetcher for /settings: resources + archived + supersessions only.
 * SettingsPage consumes only these; everything else getAppData returns
 * was dead weight on this surface. ~3 queries vs ~14 via getAppData.
 *
 * Used by: /settings.
 */
export async function getSettingsData(): Promise<{
  resources: Resource[];
  archived: Resource[];
  supersessions: Supersession[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getSettingsData timeout")), 10000)
    );
    const orgId = await resolveOrgIdFromCookies();
    const dataPromise = fetchSettingsData(orgId);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getSettingsData ${Date.now() - t0}ms`);
    alertIfFallback(result, "/settings");
    return result;
  } catch (e) {
    console.error("getSettingsData failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/settings");
    return {
      resources: [],
      archived: [],
      supersessions: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

// ── Phase 3 dashboard sidebar fetchers (Wave 1 / Track 5) ────────
//
// Each getX wraps the fetchX in supabase-server.ts behind unstable_cache
// keyed by the natural identity (userId for watchlist + awaiting-review,
// orgId for coverage gaps). 60s revalidate, tagged APP_DATA_TAG so any
// existing mutation route that flushes APP_DATA_TAG also invalidates these
// entries. Each is wrapped in try/catch so a missing migration (060/061)
// or RPC failure returns [] rather than throwing — the widgets render
// their empty-state copy in that case, keeping the dashboard merge-safe
// before migrations apply.

async function resolveUserIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

const cachedWatchlist = unstable_cache(
  async (userId: string | null): Promise<WatchlistItem[]> => {
    return fetchWatchlist(userId);
  },
  ["watchlist-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedCoverageGaps = unstable_cache(
  async (
    orgId: string | null,
    activeSectorsKey: string
  ): Promise<CoverageGap[]> => {
    void orgId; // orgId participates in the cache key for future filtering
    const sectors = activeSectorsKey ? activeSectorsKey.split("|") : [];
    return fetchCoverageGaps(sectors);
  },
  ["coverage-gaps-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedAwaitingReview = unstable_cache(
  async (userId: string | null): Promise<ReviewItem[]> => {
    return fetchAwaitingReview(userId);
  },
  ["awaiting-review-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

// Workspace aggregates (migration 068). Same TTL + tag as cachedAppData so
// the aggregates and the dashboard payload refresh together — when an
// override mutation calls revalidateTag(APP_DATA_TAG), both invalidate
// in lockstep and the rendered counts stay consistent with the row payload.
const cachedWorkspaceAggregates = unstable_cache(
  async (orgId: string | null): Promise<WorkspaceAggregates> => {
    return fetchWorkspaceAggregates(orgId);
  },
  ["workspace-aggregates-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the current user's watchlist items (regulations, sources, signals)
 * for the Dashboard Watchlist widget. Returns [] for anon users and on any
 * error (including migration 060 not yet applied).
 */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const userId = await resolveUserIdFromCookies();
    return await cachedWatchlist(userId);
  } catch (e) {
    console.error("getWatchlist failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch coverage gaps for the current workspace. v1 reads the hand-curated
 * `coverage_gaps` table (migration 061). Active sectors are not yet
 * resolved server-side from workspace settings, so this passes [] which
 * returns all curated gaps; the result is capped at 2 by the fetcher.
 */
export async function getCoverageGaps(): Promise<CoverageGap[]> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    // Active-sector filtering is a v2 enhancement once workspace sector
    // profile is exposed to server components. v1 returns the curated
    // top-N for any workspace.
    return await cachedCoverageGaps(orgId, "");
  } catch (e) {
    console.error("getCoverageGaps failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch the top oldest items awaiting admin review for the Dashboard
 * Awaiting Review widget. Returns [] for non-admins (the widget hides
 * itself in that case).
 */
export async function getAwaitingReview(): Promise<ReviewItem[]> {
  try {
    const userId = await resolveUserIdFromCookies();
    return await cachedAwaitingReview(userId);
  } catch (e) {
    console.error("getAwaitingReview failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch scalar aggregates over the workspace's active intelligence row set.
 * Used by the dashboard masthead, DashboardHero tiles, and WeeklyBriefing
 * summary so render-time stats no longer derive from the LIMIT-50
 * dashboard row payload (migration 068).
 *
 * Cached at the same TTL + tag as getAppData; the override / staged-update
 * mutation routes that revalidateTag(APP_DATA_TAG) flush both in lockstep.
 */
export async function getWorkspaceAggregates(): Promise<WorkspaceAggregates> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedWorkspaceAggregates(orgId);
  } catch (e) {
    console.error("getWorkspaceAggregates failed, returning empty:", e);
    return {
      totalItems: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 0,
      lastUpdatedAt: null,
    };
  }
}

// Scoped aggregates (migration 069). Cached at the same TTL + tag as the
// workspace-wide aggregates so /market /research /operations stays in
// lockstep with mutations. Cache key includes the serialised scope so
// each page surface gets its own cache bucket.
const cachedScopedAggregates = unstable_cache(
  async (
    orgId: string | null,
    scopeKey: string,
  ): Promise<WorkspaceAggregates> => {
    const scope: ScopeFilter | null = scopeKey ? JSON.parse(scopeKey) : null;
    return fetchWorkspaceAggregatesScoped(orgId, scope);
  },
  ["workspace-aggregates-scoped-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedSurfaceCounts = unstable_cache(
  async (orgId: string | null, surface: string): Promise<WorkspaceAggregates | null> => {
    return fetchSurfaceCounts(orgId, surface);
  },
  ["surface-counts-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Per-surface count bundle for a customer surface page's masthead / StatStrip, from the single
 * classification + counting SoT (migration 148 get_surface_counts): classification via surface_of,
 * population gated provenance_status='verified'. Fails soft when the RPC is absent (pre-apply) or
 * errors — falls back to get_workspace_intelligence_aggregates_scoped (069) over the SURFACE_RULES-
 * derived scope. This is what deletes the per-page MARKET_SCOPE / RESEARCH_SCOPE={} constants: the
 * scope now derives from the one vocab home (src/lib/surface-of.mjs), not per-page arrays.
 */
export async function getSurfaceCounts(surface: string): Promise<WorkspaceAggregates> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    const primary = await cachedSurfaceCounts(orgId, surface);
    if (primary) return primary;
  } catch (e) {
    console.warn(`getSurfaceCounts(${surface}) primary failed; falling back to scoped aggregates:`, e);
  }
  return getScopedWorkspaceAggregates(scopeFilterForSurface(surface));
}

// ── Research pipeline fetcher (auth-aware, NOT inline anon-key) ──────
//
// Replaces the prior inline-anon `createClient(NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY)` fetcher in src/app/research/page.tsx
// with the workspace data path used by /operations and /market: orgId
// resolved from authed cookies → cached fetcher → workspace service-role
// client. Returns the first PAGE_CAP rows for initial paint plus the true
// `total` so the page can surface "showing N of M" honestly. Cached at
// the same TTL + tag as getAppData / aggregates so override mutations
// refresh it in lockstep.

import type { ResearchPipelineRow } from "@/lib/supabase-server";
export type { ResearchPipelineRow };

export interface ResearchPipelineResult {
  rows: ResearchPipelineRow[];
  total: number;
  cap: number;
}

const RESEARCH_PAGE_CAP = 100;

// Cache key on orgId only — the actual fetch goes through the workspace
// service-role server client (same pattern as fetchResourcesOnly), NOT
// the cookie-aware client. The orgId resolution stays OUTSIDE the cache
// so cookies() is not invoked from within unstable_cache (Next.js does
// not allow it).
const cachedResearchPipeline = unstable_cache(
  async (orgId: string | null): Promise<ResearchPipelineResult> => {
    // Anonymous / no-org callers fall back to the seed-equivalent empty
    // pipeline. Authed callers run the same intelligence_items query the
    // prior fetcher ran, but through the workspace service-role client
    // that the rest of the platform uses.
    if (!orgId) return { rows: [], total: 0, cap: RESEARCH_PAGE_CAP };

    const { fetchResearchPipelineRows } = await import("@/lib/supabase-server");
    return fetchResearchPipelineRows(orgId, RESEARCH_PAGE_CAP);
  },
  ["research-pipeline-v2"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the research pipeline page-1 payload via the workspace data path.
 * Resolves orgId from authed cookies OUTSIDE the cache (Next.js forbids
 * dynamic-source reads inside unstable_cache). Returns rows (capped at
 * RESEARCH_PAGE_CAP), the true total count, and the cap so the page can
 * render "Showing N of M" honestly.
 *
 * Replaces the prior inline anon-key createClient(...) fetcher in
 * src/app/research/page.tsx that bypassed cookies and the workspace path.
 *
 * Falls back to an empty result on error so the surface still renders.
 */
export async function getResearchPipeline(): Promise<ResearchPipelineResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedResearchPipeline(orgId);
  } catch (e) {
    console.error("getResearchPipeline failed, returning empty:", e);
    return { rows: [], total: 0, cap: RESEARCH_PAGE_CAP };
  }
}

// Build 8.5: source coverage matrix for /research source coverage tab.
// Reads the migration 100 RPC get_research_source_coverage() (Research-bound
// sources only). Cached on the global APP_DATA_TAG so source-registry
// updates revalidate it alongside the rest of the workspace data layer.
// Re-exports the cell type so the route + view can stay schema-free of
// supabase-server.
export type { ResearchSourceCoverageCell };

const cachedResearchSourceCoverage = unstable_cache(
  async (): Promise<ResearchSourceCoverageCell[]> => {
    return fetchResearchSourceCoverage();
  },
  ["research-source-coverage-v1"],
  { revalidate: 300, tags: [APP_DATA_TAG] }
);

export async function getResearchSourceCoverage(): Promise<ResearchSourceCoverageCell[]> {
  try {
    return await cachedResearchSourceCoverage();
  } catch (e) {
    console.error("getResearchSourceCoverage failed, returning empty:", e);
    return [];
  }
}

/**
 * Fetch scalar aggregates over a SCOPED slice of the workspace's active
 * intelligence row set (migration 069). Used by /market /research /operations
 * so the masthead meta and StatStrip render the page-scoped totals instead
 * of the workspace-wide totals from getWorkspaceAggregates.
 *
 * Pass a scope filter of shape {item_types?: string[], domains?: number[]}.
 * Both keys are optional; an item matches if its item_type is in item_types
 * OR its domain is in domains (mirrors the page-level client filters).
 *
 * Falls back to empty aggregates on error so the page still renders the
 * existing row-derived counts.
 */
export async function getScopedWorkspaceAggregates(
  scope: ScopeFilter
): Promise<WorkspaceAggregates> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    // Stable cache key: sort keys + array contents so semantically-equal
    // filters share a cache bucket.
    const stable: ScopeFilter = {};
    if (scope.item_types && scope.item_types.length) {
      stable.item_types = [...scope.item_types].sort();
    }
    if (scope.domains && scope.domains.length) {
      stable.domains = [...scope.domains].sort((a, b) => a - b);
    }
    const scopeKey = JSON.stringify(stable);
    return await cachedScopedAggregates(orgId, scopeKey);
  } catch (e) {
    console.error("getScopedWorkspaceAggregates failed, returning empty:", e);
    return {
      totalItems: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
      byStatus: {},
      byJurisdiction: {},
      totalJurisdictions: 0,
      lastUpdatedAt: null,
    };
  }
}

// ── Sprint 2 Build 4: category-routed fetchers ───────────────
//
// Each wraps the corresponding fetcher in supabase-server.ts behind
// unstable_cache keyed by orgId. 60s revalidate, tagged APP_DATA_TAG so
// override mutations and the machine intake cycle's materialization invalidate them in lockstep
// with getAppData and the scoped aggregates. Anonymous and no-org callers
// share the orgId=null cache bucket (empty result).
//
// Routing rules per environmental-policy-and-innovation SKILL.md
// Section 3 are encoded src-side in supabase-server.ts; see the
// "Category-Aware Routing Fetchers" block there for the exception lists
// (IMO/ICAO → Regulations, FreightWaves/Loadstar/etc → Research, Carbon
// Trust + Project Drawdown → Research).

const cachedMarketIntel = unstable_cache(
  async (orgId: string | null): Promise<CategoryRoutedResult> => {
    return fetchMarketIntelItems(orgId);
  },
  ["market-intel-items-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedResearch = unstable_cache(
  async (orgId: string | null): Promise<CategoryRoutedResult> => {
    return fetchResearchItems(orgId);
  },
  ["research-items-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedOperations = unstable_cache(
  async (orgId: string | null): Promise<CategoryRoutedResult> => {
    return fetchOperationsItems(orgId);
  },
  ["operations-items-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedTechnology = unstable_cache(
  async (orgId: string | null): Promise<CategoryRoutedResult> => {
    return fetchTechnologyItems(orgId);
  },
  ["technology-items-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the /market category-routed row payload. Wraps
 * get_market_intel_items, MINUS the trade-press outlets the skill routes
 * to Research (FreightWaves, Loadstar, GreenBiz, Environmental Finance,
 * Splash247, Supply Chain Digital, Edie, Reuters Sustainable Business).
 *
 * Falls back to an empty result on error so the page still renders.
 */
export async function getMarketIntelItems(): Promise<CategoryRoutedResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedMarketIntel(orgId);
  } catch (e) {
    console.error("getMarketIntelItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

/**
 * Fetch the /research category-routed row payload. Pulls the orphan
 * get_research_items RPC (intergovernmental_body + academic_research +
 * standards_body for non-in-force + proposed primary legal authority)
 * MINUS IMO + ICAO (skill routes those to Regulations), PLUS Research-bound
 * trade-press outlets and Research-bound statistical-data-agency outlets
 * (Carbon Trust, Project Drawdown).
 */
export async function getResearchItems(): Promise<CategoryRoutedResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedResearch(orgId);
  } catch (e) {
    console.error("getResearchItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

/**
 * Fetch the /operations category-routed row payload. Wraps
 * get_operations_items (statistical_data_agency) MINUS Carbon Trust and
 * Project Drawdown (skill routes those to Research).
 */
export async function getOperationsItems(): Promise<CategoryRoutedResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedOperations(orgId);
  } catch (e) {
    console.error("getOperationsItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

/**
 * Fetch the /technology category-routed row payload. Wraps
 * get_technology_items (item_type-gated: technology / innovation / tool,
 * migration 134).
 */
export async function getTechnologyItems(): Promise<CategoryRoutedResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedTechnology(orgId);
  } catch (e) {
    console.error("getTechnologyItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

// ── Sprint 2 Build 7: per-source citation stats for Q9 chips ──
//
// Returns a plain-object map (not Map) so the result is RSC-serializable
// across the server-to-client boundary. The wire shape on /market is
// { [sourceId: string]: { count, recency } }.
//
// The list of sourceIds is the dedup'd set of Market Intel Resources'
// sourceId values at request time. We do not cache by orgId since
// citation stats are workspace-agnostic at the data layer (citation
// counts are per-source platform-wide). Cache key is the sorted+joined
// sourceIds string.

export type SourceCitationStatsMap = Record<string, SourceCitationStat>;

const cachedCitationStats = unstable_cache(
  async (sortedKey: string): Promise<SourceCitationStatsMap> => {
    if (!sortedKey) return {};
    const ids = sortedKey.split(",").filter(Boolean);
    const map = await fetchSourceCitationStatsByIds(ids);
    const obj: SourceCitationStatsMap = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    return obj;
  },
  ["market-citation-stats-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

export async function getSourceCitationStats(
  sourceIds: string[]
): Promise<SourceCitationStatsMap> {
  try {
    const cleaned = Array.from(
      new Set(sourceIds.filter((s): s is string => typeof s === "string" && s.length > 0))
    ).sort();
    return await cachedCitationStats(cleaned.join(","));
  } catch (e) {
    console.error("getSourceCitationStats failed, returning empty:", e);
    return {};
  }
}
