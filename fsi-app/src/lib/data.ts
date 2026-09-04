import { unstable_cache } from "next/cache";
import {
  DASHBOARD_DATA_CACHE_KEY,
  fetchDashboardData,
  fetchResourcesOnly,
  fetchListingsOnly,
  fetchPublicResourcesOnly,
  fetchPublicListingsOnly,
  fetchMapData,
  fetchListingsMapData,
  fetchSettingsData,
  fetchWatchlist,
  WATCHLIST_PAGE_LIMIT,
  fetchCoverageGaps,
  fetchAwaitingReview,
  fetchWorkspaceAggregates,
  fetchWorkspaceAggregatesScoped,
  fetchSurfaceCounts,
  fetchPublicSurfaceCounts,
  fetchMarketIntelItems,
  fetchResearchItems,
  fetchOperationsItems,
  fetchTechnologyItems,
  fetchPublicMarketIntelItems,
  fetchPublicResearchItems,
  fetchPublicOperationsItems,
  fetchPublicResearchPipelineRows,
  fetchSourceCitationStatsByIds,
  fetchPriceStatsByItemIds,
  fetchResearchSourceCoverage,
  getServiceSupabase,
  isSupabaseConfigured,
  SEED_FALLBACK_ERROR,
  type ScopeFilter,
  type CategoryRoutedResult,
  type SourceCitationStat,
  type MarketPriceStat,
  type ResearchSourceCoverageCell,
  type ResourcePage,
} from "@/lib/supabase-server";
import {
  fetchObligationRegisterPage,
  fetchForwardEventCount,
  fetchRegisterFacetOptions,
} from "@/lib/obligations/read-register.mjs";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";
import type { ObligationRow } from "@/components/regulations/ObligationRegisterFilterBar";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { mapCommunityPulseThreads as mapCommunityPulseThreadsShared } from "@/components/dashboard/pulse-shared.mjs";
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
  WatchlistItemType,
  WatchlistScope,
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
export type {
  WatchlistItem,
  WatchlistItemType,
  WatchlistScope,
  CoverageGap,
  ReviewItem,
  WorkspaceAggregates,
  ScopeFilter,
  CategoryRoutedResult,
  ResourcePage,
};

/**
 * Cache invalidation tag for workspace data. Mutation routes
 * (api/workspace/overrides, and the machine intake cycle's materialization) call
 * `revalidateTag(APP_DATA_TAG)` so users see their changes immediately
 * instead of waiting up to 60s for the cache to refresh.
 */
export const APP_DATA_TAG = "app-data";

/**
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up / migration 306). Cache invalidation
 * tag for the ORG-INDEPENDENT public intelligence read (getPublicResourcesOnly/
 * getPublicListingsOnly below) — deliberately SEPARATE from APP_DATA_TAG, not folded into it.
 *
 * Why separate: APP_DATA_TAG is flushed by every per-org write (override, watchlist, list-order,
 * personal-state — see cachedResourcesOnly's header) because those caches are keyed by orgId and
 * a single org's mutation only needs to invalidate that org's own cache entries; revalidateTag
 * doesn't distinguish which KEY it flushes, so folding this tag in would mean every user's
 * override edit anywhere also flushes the org-independent public cache platform-wide — wasteful,
 * and it invites exactly the kind of over-broad invalidation ADR-023 warns against. This tag is
 * flushed ONLY by the population/maintenance/corpus-turn completion point (the platform content
 * itself changing — new items minted, priority/archive changed by an admin at the PLATFORM
 * level, provenance status flipping to 'verified') — see scripts/lib/revalidate.mjs's PERF-10
 * addition for the wiring and this lane's REPORT for the single completion point identified.
 */
export const PUBLIC_ITEMS_TAG = "public-items";

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
  // Shape-stamped key (rule 021): rotates whenever the DashboardData
  // interface changes, so a stale cross-deployment cache entry can never
  // reach code compiled against a newer shape. Never inline the key string
  // here — rule 021 rejects an inline app-data literal in this file.
  [DASHBOARD_DATA_CACHE_KEY],
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
    recentChanges: [] as import("@/lib/supabase-server").RecentChangeRow[],
    changelog: {} as Record<string, ChangeLogEntry[]>,
    disputes: {} as Record<string, Dispute>,
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
 *
 * Optional `page` (first-paint pagination, cost-constrained ledgers): when
 * given, threads straight through to fetchResourcesOnly → fetchWorkspaceResources,
 * which orders by added_date descending (nulls last) and ranges the RPC
 * result. Omitted = unpaged (existing full-corpus behavior, unchanged) — the
 * /api/listings/rest route passes a page to fetch the remainder of whatever
 * offset the caller already rendered.
 */
// PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md §4/§6 "index pages"): unlike
// getAppData (cachedAppData above), getResourcesOnly/getListingsOnly were NEVER wrapped in
// unstable_cache — every /regulations, /market, /operations render re-ran the full RPC, which is why
// the audit's Vercel logs showed cache=MISS/BYPASS on every one of these requests, repeat navigations
// included. fetchResourcesOnly/fetchListingsOnly (supabase-server.ts) call
// get_workspace_intelligence[_slim|_listings](p_org_id) — an RPC that LEFT JOINs workspace_item_overrides
// and bakes each org's archived/priority overrides directly into the returned rows (fetchWorkspaceResources's
// own comment: "Workspace items via the RPC that LEFT JOINs workspace_item_overrides"). That means the
// per-org "base list" is NOT actually org-independent at the data layer — a true item-scoped/viewer-scoped
// split (like load-detail.ts's) would need a second RPC variant that omits the override join, which is a
// migration-level change outside this lane's write set (no migrations). The honest, in-scope fix applied
// here instead is the SAME pattern cachedAppData already uses successfully for the home page: cache the
// resolved PER-ORG page, keyed by (orgId, page), tagged APP_DATA_TAG — the exact tag every existing
// override/watchlist/list-order mutation route already revalidates (grep: api/workspace/overrides,
// api/watchlist, api/user/list-order, api/workspace/personal-state all call
// revalidateTag(APP_DATA_TAG, "max")), so this cache is invalidated by every write that could make it
// stale with ZERO new wiring. Repeat navigations to the same surface within the 60s window now hit the
// cache instead of re-running the RPC; a first hit per org per surface still pays the full query, same as
// before.
const cachedResourcesOnly = unstable_cache(
  (orgId: string | null, page?: ResourcePage) => fetchResourcesOnly(orgId, page),
  ["resources-only-4f1a9b3d"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

const cachedListingsOnly = unstable_cache(
  (orgId: string | null, page?: ResourcePage) => fetchListingsOnly(orgId, page),
  ["listings-only-4f1a9b3d"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

export async function getResourcesOnly(page?: ResourcePage): Promise<{
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
    const dataPromise = cachedResourcesOnly(orgId, page);
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
 *
 * Optional `page` — see getResourcesOnly's doc comment; same contract.
 */
export async function getListingsOnly(page?: ResourcePage): Promise<{
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
    const dataPromise = cachedListingsOnly(orgId, page);
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
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up / migration 306): org-independent
 * counterparts to getResourcesOnly/getListingsOnly above.
 *
 * WHY THESE EXIST (root cause): getResourcesOnly/getListingsOnly both call
 * resolveOrgIdFromCookies() — a cookies() read — BEFORE their unstable_cache-wrapped inner call,
 * so every route that rendered from them (/regulations, /market, /operations pre-this-lane)
 * carried a Dynamic API dependency in its own server render and built `ƒ` even after this lane's
 * layout.tsx fix removed the OTHER, shared-tree cause. These two functions read NO cookie and
 * resolve NO orgId — they call the new zero-argument public RPCs (migration 306:
 * get_workspace_intelligence_slim_public/_listings_public), which omit the
 * workspace_item_overrides join entirely (platform priority/archive state only). Result: a page
 * built from ONLY these two functions (plus no other Dynamic API in its tree) can be static.
 *
 * WHAT IS DELIBERATELY NOT CACHED HERE: the per-org override layer (priority overrides, archive
 * state, owner, notes) — that per-viewer data now arrives exclusively via
 * useWorkspaceOverridesHydration() (client-side, off the useWorkspaceBootstrap() singleton) and
 * is merged into these cached public rows in the BROWSER via mergeWithOverrides
 * (resourceStore.ts), never baked into a server-cached response keyed only by page. Caching a
 * per-viewer read here — even briefly — would violate UX-laws' "never render wrong for a logged-
 * in viewer" the moment two different orgs' overrides collided in one shared cache entry; this
 * split makes that structurally impossible rather than merely untested.
 *
 * Cache key carries ONLY `page` (no orgId) — every viewer, org, and anonymous visitor shares the
 * SAME cache entries for the same page, which is the whole point (server render no longer forks
 * per org). Tagged PUBLIC_ITEMS_TAG, not APP_DATA_TAG — see that constant's header.
 */
const cachedPublicResourcesOnly = unstable_cache(
  (page?: ResourcePage) => fetchPublicResourcesOnly(page),
  ["public-resources-only-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

const cachedPublicListingsOnly = unstable_cache(
  (page?: ResourcePage) => fetchPublicListingsOnly(page),
  ["public-listings-only-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

export async function getPublicResourcesOnly(page?: ResourcePage): Promise<{
  resources: Resource[];
  archived: Resource[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getPublicResourcesOnly timeout")), 10000)
    );
    const dataPromise = cachedPublicResourcesOnly(page);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getPublicResourcesOnly ${Date.now() - t0}ms`);
    alertIfFallback(result, "/operations|/market");
    return result;
  } catch (e) {
    console.error("getPublicResourcesOnly failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/operations|/market");
    return {
      resources: [],
      archived: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

export async function getPublicListingsOnly(page?: ResourcePage): Promise<{
  resources: Resource[];
  archived: Resource[];
  _error?: string;
  _fallbackTrigger?: SeedFallbackTrigger;
}> {
  const t0 = Date.now();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("getPublicListingsOnly timeout")), 10000)
    );
    const dataPromise = cachedPublicListingsOnly(page);
    const result = await Promise.race([dataPromise, timeout.then(() => { throw new Error("timeout"); })]);
    console.log(`[perf] getPublicListingsOnly ${Date.now() - t0}ms`);
    alertIfFallback(result, "/regulations");
    return result;
  } catch (e) {
    console.error("getPublicListingsOnly failed, using fallback:", e);
    void recordSeedFallbackFlag("exception", "/regulations");
    return {
      resources: [],
      archived: [],
      _error: SEED_FALLBACK_ERROR,
      _fallbackTrigger: "exception",
    };
  }
}

/**
 * Slim fetcher for /map: resources + the relationship payload the map
 * surface needs (changelog, disputes, supersessions). Drops
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

// Dual scope (2026-08-02): orgId is a real cache-key participant, not a
// placeholder. The rail merges user_watchlist (personal) with org_watchlist
// (team), so two members of different orgs must not share an entry. Key
// bumped to v2 because the cached shape gained `scope`, `note`, `addedBy`.
const cachedWatchlist = unstable_cache(
  async (userId: string | null, orgId: string | null): Promise<WatchlistItem[]> => {
    return fetchWatchlist(userId, orgId);
  },
  ["watchlist-v2"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

// The full /watchlist surface. A SEPARATE cache entry rather than a `limit`
// argument threaded into the one above, because unstable_cache keys on the
// arguments it is given: sharing an entry between a 14-row read and a 250-row
// read would let whichever call warmed the cache first decide what the other
// one sees — the dashboard could serve the page a truncated list, or the page
// could bloat every dashboard payload with 250 rows to render three.
const cachedWatchlistFull = unstable_cache(
  async (userId: string | null, orgId: string | null): Promise<WatchlistItem[]> => {
    return fetchWatchlist(userId, orgId, WATCHLIST_PAGE_LIMIT);
  },
  ["watchlist-full-v1"],
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
 * Fetch the current user's watchlist for the Dashboard Watchlist widget:
 * personal watches (user_watchlist) merged with the team watchlist
 * (org_watchlist) of whichever org the cookies resolve to. Returns [] for
 * anon users and on any error.
 *
 * Org resolution degrades to null rather than throwing: a member whose org
 * cannot be resolved still sees their personal rail. That asymmetry is
 * deliberate and read-path only — the WRITE path must 403 instead, since
 * org_watchlist.org_id is NOT NULL and a null there would be a silent
 * mis-scoped insert.
 */
export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const [userId, orgId] = await Promise.all([
      resolveUserIdFromCookies(),
      resolveOrgIdFromCookies().catch(() => null),
    ]);
    return await cachedWatchlist(userId, orgId);
  } catch (e) {
    console.error("getWatchlist failed, returning empty:", e);
    return [];
  }
}

/**
 * The same watchlist read, bounded for the full /watchlist surface rather
 * than the dashboard rail.
 *
 * Same cookie resolution, same fail-soft posture, same cache tag, so a watch
 * added anywhere invalidates the rail and the page together and the two can
 * never show different lists. The ONLY difference is the per-scope bound.
 */
export async function getWatchlistFull(): Promise<WatchlistItem[]> {
  try {
    const [userId, orgId] = await Promise.all([
      resolveUserIdFromCookies(),
      resolveOrgIdFromCookies().catch(() => null),
    ]);
    return await cachedWatchlistFull(userId, orgId);
  } catch (e) {
    console.error("getWatchlistFull failed, returning empty:", e);
    return [];
  }
}

/** Per-scope bound the /watchlist surface reads with. Re-exported so the page
 *  can tell the user honestly when their list is at the cap rather than
 *  presenting a truncated list as complete. */
export { WATCHLIST_PAGE_LIMIT };

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

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): org-independent counterpart to
// getSurfaceCounts above. [CONFIRMED, this lane, via Supabase MCP pg_get_functiondef]
// get_surface_counts(p_org_id, p_surface) carries NO `_assert_org_membership` call (a plain LANGUAGE
// sql function) and its LEFT JOIN workspace_item_overrides ON wo.org_id = p_org_id simply matches
// nothing when p_org_id IS NULL — the by_priority/by_severity/etc tallies collapse to the item's own
// priority/is_archived (the platform "no override" default), the same degenerate case
// get_workspace_intelligence_slim_public (migration 306) already returns. So this call is genuinely
// safe with a NULL org_id at the DB level; only fetchSurfaceCounts' OWN `!orgId → null` guard (a
// caller-side choice, not a DB requirement) and this function's own resolveOrgIdFromCookies() call
// stood in the way of a cookie-free read.
//
// TRADE-OFF, STATED HONESTLY: the returned counts are PLATFORM-wide (no per-org priority/archive
// override folded into the tally), same as the item rows themselves after this lane's change — a
// workspace that has overridden an item's priority or archived it via the workspace layer will see
// that reflected in the RENDERED rows (client-merged via mergeWithOverrides + this lane's
// useWorkspaceOverridesHydration) but not yet in this masthead/tile COUNT, which stays platform-only
// until a future lane recomputes the tally client-side from the same merged row set. This is a
// narrower version of the same simplification ADR-026/migration 306 already accepts for the row
// listing itself (see migration 306's "ARCHIVED-ROW BOUNDARY" note) — not a new category of
// inaccuracy, and every existing consumer already treats these counts as a fail-soft estimate
// (`aggregates.totalItems || rows.length` fallback pattern throughout the four index pages).
// NOTE (PERF-10, root-cause fix, same day): this must call fetchPublicSurfaceCounts, NOT
// fetchSurfaceCounts(null, surface) — fetchSurfaceCounts has its own `!orgId → return null` guard
// (supabase-server.ts) that would silently short-circuit every call here to null before the RPC ever
// ran, permanently collapsing every public masthead/tile count to the zero-filled fallback below. A
// real defect this lane found and fixed while proving the build — see fetchPublicSurfaceCounts' own
// header in supabase-server.ts for the full story.
const cachedPublicSurfaceCounts = unstable_cache(
  async (surface: string): Promise<WorkspaceAggregates | null> => fetchPublicSurfaceCounts(surface),
  ["public-surface-counts-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

export async function getPublicSurfaceCounts(surface: string): Promise<WorkspaceAggregates> {
  try {
    const primary = await cachedPublicSurfaceCounts(surface);
    if (primary) return primary;
  } catch (e) {
    console.warn(`getPublicSurfaceCounts(${surface}) failed:`, e);
  }
  return {
    totalItems: 0,
    byPriority: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0 },
    byStatus: {},
    byJurisdiction: {},
    totalJurisdictions: 0,
    lastUpdatedAt: null,
  };
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

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): org-independent counterpart to
// getResearchPipeline above. See fetchPublicResearchPipelineRows's header (supabase-server.ts) for
// why this is safe — orgId was already unused by the underlying query; only this function's own
// cookies() read + the cached wrapper's `!orgId → empty` gate stood in the way. No orgId in the
// cache key (one shared entry for the whole app). Tagged PUBLIC_ITEMS_TAG, not APP_DATA_TAG.
const cachedPublicResearchPipeline = unstable_cache(
  async (): Promise<ResearchPipelineResult> => fetchPublicResearchPipelineRows(RESEARCH_PAGE_CAP),
  ["public-research-pipeline-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

export async function getPublicResearchPipeline(): Promise<ResearchPipelineResult> {
  try {
    return await cachedPublicResearchPipeline();
  } catch (e) {
    console.error("getPublicResearchPipeline failed, returning empty:", e);
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

// WO-13 B4 re-point (2026-08-30): batch price-stat decoration for the
// Market list-page key figure, from published_price_statistics — the same
// table PriceBoard already reads on the detail route, now ALSO read here,
// list-scoped (see fetchPriceStatsByItemIds' header in supabase-server.ts).
//
// Cache-key note (rule 021): this is a BRAND NEW cache key
// ("market-price-stats-v1") — it does not modify what `cachedMarketIntel`
// ("market-intel-items-v1") caches or returns, so there is no existing
// payload shape to go stale-incompatible and nothing to rotate. Mirrors the
// cachedCitationStats precedent below exactly (own key, own shape, decorated
// onto Resource[] by the caller here rather than baked into the RPC cache).
const cachedMarketPriceStats = unstable_cache(
  async (sortedIdsKey: string): Promise<Record<string, MarketPriceStat>> => {
    if (!sortedIdsKey) return {};
    const ids = sortedIdsKey.split(",").filter(Boolean);
    const map = await fetchPriceStatsByItemIds(ids);
    const obj: Record<string, MarketPriceStat> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    return obj;
  },
  ["market-price-stats-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the /market category-routed row payload. Wraps
 * get_market_intel_items, MINUS the trade-press outlets the skill routes
 * to Research (FreightWaves, Loadstar, GreenBiz, Environmental Finance,
 * Splash247, Supply Chain Digital, Edie, Reuters Sustainable Business).
 *
 * WO-13 B4: after the category RPC returns, batch-decorates each resource
 * with `priceStat` from published_price_statistics (see
 * cachedMarketPriceStats above). Live-verified 2026-08-30: of the 48
 * verified, non-archived items this RPC currently returns, exactly 1 has a
 * published_price_statistics row to attach — every other card keeps the
 * honest em-dash. Non-fatal: a price-stat lookup failure leaves every
 * resource's `priceStat` unset, same as before this decoration existed.
 *
 * Falls back to an empty result on error so the page still renders.
 */
export async function getMarketIntelItems(): Promise<CategoryRoutedResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    const result = await cachedMarketIntel(orgId);
    const ids = Array.from(new Set(result.resources.map((r) => r.id).filter(Boolean))).sort();
    if (ids.length === 0) return result;
    const statsByItemId = await cachedMarketPriceStats(ids.join(","));
    return {
      ...result,
      resources: result.resources.map((r) =>
        statsByItemId[r.id] ? { ...r, priceStat: statsByItemId[r.id] } : r
      ),
    };
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

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up / migration 306): org-independent
// counterparts to getMarketIntelItems/getOperationsItems/getResearchItems above, backing
// /market's, /operations', and /research's category-routed ledgers. Same root cause as
// getPublicResourcesOnly/getPublicListingsOnly's header: get_market_intel_items(p_org_id) /
// get_operations_items(p_org_id) / get_research_items(p_org_id) each `PERFORM
// public._assert_org_membership(p_org_id)` (verified live, this lane, via Supabase MCP
// pg_get_functiondef — see migration 306's header), so each requires resolveOrgIdFromCookies()
// BEFORE the cached inner call — a cookies() read in these three pages' own server render,
// independent of the shared-layout cause. These call the new zero-argument `_public` RPC siblings
// (migration 306) instead — no cookies, no per-org override join. Cache key carries no orgId (one
// shared entry, matching getPublicResourcesOnly). Tagged PUBLIC_ITEMS_TAG, not APP_DATA_TAG — see
// that constant's header.
//
// WHAT IS DELIBERATELY NOT CACHED HERE: same posture as getPublicResourcesOnly/getPublicListingsOnly
// — the per-org override layer merges client-side via useWorkspaceOverridesHydration +
// mergeWithOverrides, never baked into this shared cache entry.
const cachedPublicMarketIntel = unstable_cache(
  fetchPublicMarketIntelItems,
  ["public-market-intel-items-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

const cachedPublicResearch = unstable_cache(
  fetchPublicResearchItems,
  ["public-research-items-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

const cachedPublicOperations = unstable_cache(
  fetchPublicOperationsItems,
  ["public-operations-items-perf10"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

export async function getPublicMarketIntelItems(): Promise<CategoryRoutedResult> {
  try {
    const result = await cachedPublicMarketIntel();
    const ids = Array.from(new Set(result.resources.map((r) => r.id).filter(Boolean))).sort();
    if (ids.length === 0) return result;
    const statsByItemId = await cachedMarketPriceStats(ids.join(","));
    return {
      ...result,
      resources: result.resources.map((r) =>
        statsByItemId[r.id] ? { ...r, priceStat: statsByItemId[r.id] } : r
      ),
    };
  } catch (e) {
    console.error("getPublicMarketIntelItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

export async function getPublicResearchItems(): Promise<CategoryRoutedResult> {
  try {
    return await cachedPublicResearch();
  } catch (e) {
    console.error("getPublicResearchItems failed, returning empty:", e);
    return { resources: [], total: 0 };
  }
}

export async function getPublicOperationsItems(): Promise<CategoryRoutedResult> {
  try {
    return await cachedPublicOperations();
  } catch (e) {
    console.error("getPublicOperationsItems failed, returning empty:", e);
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

// ── Community pulse (Dashboard five-surface rebalance, Lane DASH 2026-09-02) ────────────────
//
// Community has no category-routed intelligence_items fetcher — it is not an intelligence_items
// query at all (groups/threads, per source-credibility-model Section 8; same distinction
// src/lib/dashboard/surface-coverage.ts's own header documents for the "activeGroups" count). This
// is a NEW, DASH-owned read, added here because it is the Dashboard's Community block's data path:
// the org's most recently active top-level community threads, scoped to the groups the org's OWN
// members belong to (mirrors fetchCommunityCounts in surface-coverage.ts's org_memberships ->
// community_group_members join — group membership, never a raw `privacy='public'` scan, which
// would leak another workspace's group content through the service-role client).

export interface CommunityPulseThread {
  id: string;
  groupId: string;
  groupName: string;
  groupSlug: string | null;
  title: string;
  replyCount: number;
  lastActivityAt: string | null;
}

export interface CommunityPulseResult {
  /** Distinct groups this workspace's own members belong to. Independently computed (not
   *  re-exported) because getSurfaceCoverageSnapshot's fetchCommunityCounts is module-private —
   *  same org_memberships -> community_group_members join, so the two numbers agree by construction
   *  rather than by import. */
  activeGroups: number;
  threads: CommunityPulseThread[];
}

const EMPTY_COMMUNITY_PULSE: CommunityPulseResult = { activeGroups: 0, threads: [] };

/**
 * Pure mapper: raw community_posts rows + a group-id -> {name, slug} lookup -> CommunityPulseThread[].
 * The row-shaping logic itself — title fallback to the body when a thread has no title,
 * last-activity precedence — lives in src/components/dashboard/pulse-shared.mjs (plain ESM, zero
 * deps) so it gets a portable, DB-free `node --test` proof: this module imports `next/cache` and
 * `@supabase/supabase-js` at module scope and cannot join the no-npm-ci discipline suite itself.
 * Re-exported here (same name, same signature) so `@/lib/data` stays the public entry point.
 */
export const mapCommunityPulseThreads: (
  rows: Array<{
    id: string;
    group_id: string;
    title: string | null;
    body: string;
    reply_count: number | null;
    last_reply_at: string | null;
    created_at: string;
  }>,
  groupsById: Map<string, { name: string; slug: string | null }>
) => CommunityPulseThread[] = mapCommunityPulseThreadsShared;

const COMMUNITY_PULSE_THREAD_LIMIT = 3;

const cachedCommunityPulse = unstable_cache(
  async (orgId: string | null): Promise<CommunityPulseResult> => {
    if (!orgId || !isSupabaseConfigured()) return EMPTY_COMMUNITY_PULSE;
    try {
      const supabase = getServiceSupabase();

      // Same org-membership scoping as fetchCommunityCounts (surface-coverage.ts): the workspace's
      // OWN members' group memberships, never a raw cross-org scan.
      const { data: memberRows, error: memberErr } = await supabase
        .from("org_memberships")
        .select("user_id")
        .eq("org_id", orgId);
      if (memberErr) {
        console.error("[dashboard] community pulse org_memberships error:", memberErr.message);
        return EMPTY_COMMUNITY_PULSE;
      }
      const userIds = ((memberRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
      if (userIds.length === 0) return EMPTY_COMMUNITY_PULSE;

      const { data: cgmRows, error: cgmErr } = await supabase
        .from("community_group_members")
        .select("group_id")
        .in("user_id", userIds);
      if (cgmErr) {
        console.error("[dashboard] community pulse group_members error:", cgmErr.message);
        return EMPTY_COMMUNITY_PULSE;
      }
      const groupIds = Array.from(
        new Set(((cgmRows ?? []) as Array<{ group_id: string }>).map((r) => r.group_id).filter(Boolean))
      );
      if (groupIds.length === 0) return { activeGroups: 0, threads: [] };

      const [groupsRes, postsRes] = await Promise.all([
        supabase.from("community_groups").select("id, name, slug").in("id", groupIds),
        supabase
          .from("community_posts")
          .select("id, group_id, title, body, reply_count, last_reply_at, created_at")
          .in("group_id", groupIds)
          .is("parent_post_id", null)
          .order("last_reply_at", { ascending: false, nullsFirst: false })
          .limit(COMMUNITY_PULSE_THREAD_LIMIT),
      ]);

      if (groupsRes.error) {
        console.error("[dashboard] community pulse groups error:", groupsRes.error.message);
      }
      if (postsRes.error) {
        console.error("[dashboard] community pulse posts error:", postsRes.error.message);
      }

      const groupsById = new Map<string, { name: string; slug: string | null }>();
      for (const g of (groupsRes.data ?? []) as Array<{ id: string; name: string; slug: string | null }>) {
        groupsById.set(g.id, { name: g.name, slug: g.slug });
      }

      const threads = mapCommunityPulseThreads(
        (postsRes.data ?? []) as Parameters<typeof mapCommunityPulseThreads>[0],
        groupsById
      );

      return { activeGroups: groupIds.length, threads };
    } catch (e) {
      console.error("[dashboard] community pulse fetch failed:", e);
      return EMPTY_COMMUNITY_PULSE;
    }
  },
  ["dashboard-community-pulse-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

/**
 * Fetch the Dashboard's Community block: the count of groups this workspace's own members belong
 * to, plus the up-to-3 most recently active top-level threads in those groups. A NEW, DASH-owned
 * read (dashboard five-surface rebalance, 2026-09-02) — Community has no category-routed
 * intelligence_items fetcher (see header). Fails soft to the empty shape so the Community pulse
 * card renders its honest empty state rather than throwing.
 */
export async function getCommunityPulse(): Promise<CommunityPulseResult> {
  try {
    const orgId = await resolveOrgIdFromCookies();
    return await cachedCommunityPulse(orgId);
  } catch (e) {
    console.error("getCommunityPulse failed, returning empty:", e);
    return EMPTY_COMMUNITY_PULSE;
  }
}

/**
 * RECONCILE (2026-09-04, item 4b-i): SSR seed for ObligationRegister.tsx's LIST-variant, UNFILTERED
 * first page. ObligationRegister was converted to a pure client-mount fetch by PERF-10 (its own header:
 * reading migration 290's `obligations` via the cookie-bound request-scoped client during THIS page's
 * server render was a Dynamic API dependency forcing /regulations `ƒ`) — correct at the time, but it
 * left this one section blank ("Loading obligation register…") on every first paint, the exact defect
 * this reconciliation's item 4b calls out.
 *
 * WHY A SERVICE-ROLE READ IS SAFE HERE (measured, not assumed — read-register.mjs's own functions take
 * an injected client, so nothing there needed to change). Migration 290's own RLS policy
 * (`obligations_read`, this file's own comment history / supabase/migrations/290_obligations.sql):
 *   USING (EXISTS (SELECT 1 FROM intelligence_items i WHERE i.id = obligations.intelligence_item_id
 *                    AND i.is_archived = false))
 * — no org check, no auth.uid() check, applies identically to anon and authenticated roles alike. This
 * table has never been per-viewer data; RLS is a DB-level backstop for a predicate `read-register.mjs`
 * already re-applies at the application layer (`fetchObligationRegisterPage`'s own item join filters
 * `is_archived=false AND provenance_status='verified'`, STRICTER than the RLS policy's `is_archived`-only
 * check) — so a service-role call replicating that same predicate returns a result no anon RLS-scoped
 * call could not also have returned. This is the identical reasoning migration 306's `_public` RPCs
 * apply for the workspace-intelligence tables (see that migration's own header) — the obligations
 * register just never needed a NEW migration to express it, because read-register.mjs's own functions
 * were already client-agnostic.
 *
 * SCOPE: the list variant's UNFILTERED first page ONLY (no jurisdiction/mode/binding/dueWindow filter,
 * offset 0) — exactly the shape ObligationRegister.tsx's own client effect used to request on mount
 * (see /api/obligations/register/route.ts's own "isFirstLoad" gate for the identical shape check). A
 * filter change or "Load more" still calls that route directly, client-side, through the REQUEST-SCOPED
 * client — unchanged by this fix; only the very first, always-the-same-for-every-viewer render moves to
 * this cached, cookie-free path. The itemId-scoped DETAIL variant is unaffected (it was never the
 * blank-on-first-paint defect this item targets: it renders nothing while loading, matching its own
 * already-honest "zero obligations" empty state, which is not the same defect as a customer-facing LIST
 * section reading "Loading…" on every navigation).
 *
 * Tagged PUBLIC_ITEMS_TAG (not APP_DATA_TAG) and no orgId in the cache key — one shared entry for the
 * whole app, same posture as every other getPublic* wrapper in this file.
 */
export interface PublicObligationRegisterFirstPage {
  rows: ObligationRow[];
  total: number;
  sourceEventCount?: number | null;
  jurisdictionOptions: string[];
  modeOptions: string[];
}

const cachedPublicObligationRegisterFirstPage = unstable_cache(
  async (): Promise<PublicObligationRegisterFirstPage> => {
    const supabase = getServiceSupabase();
    const { rows, total } = await fetchObligationRegisterPage(supabase, {
      offset: 0,
      limit: LIST_FIRST_PAGE_SIZE,
    });
    const [sourceEventCount, facets] = await Promise.all([
      // Same "only when the register itself is empty" gate the route applies — see its own header
      // for why this count exists (spec-01's "derived from N forward events" honest-empty copy).
      total === 0 ? fetchForwardEventCount(supabase) : Promise.resolve(undefined),
      fetchRegisterFacetOptions(supabase),
    ]);
    return {
      rows: rows as ObligationRow[],
      total,
      sourceEventCount,
      jurisdictionOptions: facets.jurisdictions,
      modeOptions: facets.modes,
    };
  },
  ["public-obligation-register-first-page-reconcile"],
  { revalidate: 60, tags: [PUBLIC_ITEMS_TAG] }
);

export async function getPublicObligationRegisterFirstPage(): Promise<PublicObligationRegisterFirstPage> {
  try {
    return await cachedPublicObligationRegisterFirstPage();
  } catch (e) {
    console.error("getPublicObligationRegisterFirstPage failed, returning empty:", e);
    return { rows: [], total: 0, jurisdictionOptions: [], modeOptions: [] };
  }
}
