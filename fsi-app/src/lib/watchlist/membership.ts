// Watchlist membership — ONE place for "which of these items does this viewer already have
// watched" queries, used two ways:
//
//   1. SERVER (buildWatchMembership + fetchWatchMembership): one batched read for a whole page's
//      worth of item ids of a single item_type (personal + team), so a server component can seed
//      every <WatchButton> on the page with props instead of each instance firing its own GET
//      /api/watchlist on mount. market/page.tsx uses this for MarketSeriesBoard's per-row watch
//      buttons (docs/audits/perf-load-times-2026-09-03.md item 2: "GET /api/watchlist six times
//      within 3ms on every visit" — six populated market_series rows, six WatchButton instances,
//      previously six independent client fetches for a page that already runs server-side).
//
//   2. CLIENT (getClientWatchMembership): a module-level promise cache, ONE per item_type, shared
//      by every mounted WatchButton instance that was NOT given server-resolved initial state (the
//      four detail-page surfaces — RegulationDetailSurface, MarketSignalDetailSurface,
//      OperationsDetailSurface, ResearchFindingDetailSurface — each mount exactly one WatchButton
//      per page load, fed by src/app/{regulations,market,operations,research}/[slug]/page.tsx,
//      which is outside this lane's write set, so those detail pages cannot be made to thread
//      server props the way market/page.tsx now does; see this lane's report for the write-set
//      note). Even at one instance per page this replaces WatchButton's old single-item GET with
//      the same list-mode GET server-side already serves for case 1, so any surface that later
//      grows more than one WatchButton of the same item_type (a list-mode ledger row, say) gets
//      request-count safety for free — N mounted instances of the same item_type on one page
//      always resolve from ONE network request, never N.
//
// Both halves return the SAME per-item shape (WatchMembershipEntry) so a caller — server or
// client — gets an identical {watched, teamWatched, teamAvailable} triple regardless of which
// path produced it, and WatchButton.tsx's prop contract does not need to know which path fed it.
//
// The server half takes its Supabase reads via injected deps (this repo's standing DRY-by-default
// pattern for anything touching the database — see scripts/mint/apply-mint-batch.mjs), so
// buildWatchMembership's actual decision logic (dedupe ids, resolve personal vs team scope, honest
// teamAvailable=false when no org) is provable with `node --test` and no database. The client half
// takes its fetch implementation and auth-header builder as parameters for the identical reason —
// pure/testable without a browser or a real network call.

/** Per-item watch state, the same shape WatchButton.tsx's initial-state props expect. */
export interface WatchMembershipEntry {
  watched: boolean;
  teamWatched: boolean;
  teamAvailable: boolean;
}

const EMPTY_ENTRY: WatchMembershipEntry = {
  watched: false,
  teamWatched: false,
  teamAvailable: false,
};

// ─── 1. SERVER: batched read for a page's worth of ids ─────────────────────────────────────────

export interface WatchMembershipDeps {
  /** Ids of `itemType` the given user has personally watched, narrowed to `itemIds` (a WHERE ...
   *  IN query, never an unbounded scan). Return the FULL set the caller already has watched among
   *  itemIds — no need to pre-filter beyond that; buildWatchMembership does the per-id lookup. */
  queryPersonalWatchedIds(userId: string, itemType: string, itemIds: string[]): Promise<Set<string>>;
  /** Same contract as queryPersonalWatchedIds, scoped to the org's team watchlist instead. */
  queryTeamWatchedIds(orgId: string, itemType: string, itemIds: string[]): Promise<Set<string>>;
}

export interface WatchMembershipParams {
  /** Signed-out or unresolvable viewer: personal membership is honestly all-false, never queried. */
  userId: string | null;
  /** No org resolved: teamAvailable is honestly false for every id, never queried. */
  orgId: string | null;
  itemType: string;
  itemIds: string[];
}

/** One batched membership read for every id in `itemIds`, deduped. Empty `itemIds` short-circuits
 *  to an empty map without calling either dep — nothing to look up. */
export async function buildWatchMembership(
  deps: WatchMembershipDeps,
  params: WatchMembershipParams
): Promise<Map<string, WatchMembershipEntry>> {
  const { userId, orgId, itemType, itemIds } = params;
  const uniqueIds = Array.from(new Set(itemIds.filter((id) => id.length > 0)));
  if (uniqueIds.length === 0) return new Map();

  const [personal, team] = await Promise.all([
    userId ? deps.queryPersonalWatchedIds(userId, itemType, uniqueIds) : Promise.resolve(new Set<string>()),
    orgId ? deps.queryTeamWatchedIds(orgId, itemType, uniqueIds) : Promise.resolve(new Set<string>()),
  ]);

  const teamAvailable = !!orgId;
  const map = new Map<string, WatchMembershipEntry>();
  for (const id of uniqueIds) {
    map.set(id, { watched: personal.has(id), teamWatched: team.has(id), teamAvailable });
  }
  return map;
}

/** Map lookup with the same honest-empty default a caller would get from an item this page never
 *  fetched membership for (e.g. an id absent from itemIds by mistake) — never throws, never
 *  fabricates a watched=true. */
export function lookupWatchMembership(
  map: Map<string, WatchMembershipEntry>,
  itemId: string
): WatchMembershipEntry {
  return map.get(itemId) ?? EMPTY_ENTRY;
}

// `import type` only — fully erased at runtime (same pattern src/lib/detail/load-detail-core.ts
// documents for next/cache), so this module stays a plain node --test-able function with zero
// runtime dependency on @supabase/supabase-js. `any` here matches how the rest of this codebase
// (supabase-server.ts, supabase-service.ts) types a Supabase client generically — Postgrest's own
// builder types recurse deeply enough that a hand-rolled structural type for just .select/.eq/.in
// hits TS2589 (excessively deep instantiation) against the real client, so this accepts the same
// loosely-typed client every other data-access function in this codebase already does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WatchTableClient = { from(table: "user_watchlist" | "org_watchlist"): any };

async function queryWatchedIds(
  supabase: WatchTableClient,
  table: "user_watchlist" | "org_watchlist",
  scopeCol: "user_id" | "org_id",
  scopeVal: string,
  itemType: string,
  itemIds: string[]
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from(table)
    .select("item_id")
    .eq(scopeCol, scopeVal)
    .eq("item_type", itemType)
    .in("item_id", itemIds);
  if (error || !data) return new Set();
  return new Set((data as { item_id: string }[]).map((r) => r.item_id));
}

/** Real Supabase wiring for buildWatchMembership's deps — same tables/columns
 *  src/app/api/watchlist/route.ts's GET handler reads (user_watchlist / org_watchlist,
 *  scoped by user_id / org_id + item_type + item_id). Callers pass a service-role or
 *  request-scoped client; this function does not care which. */
export function makeWatchMembershipDeps(supabase: WatchTableClient): WatchMembershipDeps {
  return {
    queryPersonalWatchedIds: (userId, itemType, itemIds) =>
      queryWatchedIds(supabase, "user_watchlist", "user_id", userId, itemType, itemIds),
    queryTeamWatchedIds: (orgId, itemType, itemIds) =>
      queryWatchedIds(supabase, "org_watchlist", "org_id", orgId, itemType, itemIds),
  };
}

/** Convenience wrapper: real Supabase client straight to a membership map, one call. */
export async function fetchWatchMembership(
  supabase: WatchTableClient,
  params: WatchMembershipParams
): Promise<Map<string, WatchMembershipEntry>> {
  return buildWatchMembership(makeWatchMembershipDeps(supabase), params);
}

// ─── 2. CLIENT: one shared fetch per item_type per page ────────────────────────────────────────

/** Response shape of GET /api/watchlist?item_type=<t> (list mode, no item_id — added by this
 *  lane; see src/app/api/watchlist/route.ts's GET handler header). */
interface WatchlistListResponse {
  watchedIds?: string[];
  teamWatchedIds?: string[];
  teamAvailable?: boolean;
}

/** Module-level: one in-flight/resolved promise per item_type, shared by every WatchButton
 *  instance on this page that falls back to the client path. Never manually invalidated for
 *  reads — a full page load gets a fresh module instance, and the toggle write path
 *  (WatchButton's own POST/DELETE) updates its own component state directly rather than through
 *  this cache, so a stale read here never blocks a correct write. */
const clientCache = new Map<string, Promise<Map<string, WatchMembershipEntry>>>();

export interface ClientWatchMembershipOptions {
  /** Injected so this stays testable without a browser/network — WatchButton.tsx supplies the
   *  real `fetch` plus a Bearer auth header built from the browser Supabase session. */
  fetchImpl: typeof fetch;
  authHeader: Record<string, string>;
}

/** Returns the shared per-item_type membership map, fetching it (once) on first call for that
 *  item_type this page load. A failed fetch resolves to an empty map (every WatchButton renders
 *  its honest unwatched default) rather than rejecting, so one bad request never wedges every
 *  button of that type into a permanently-loading state. */
export function getClientWatchMembership(
  itemType: string,
  options: ClientWatchMembershipOptions
): Promise<Map<string, WatchMembershipEntry>> {
  const cached = clientCache.get(itemType);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const resp = await options.fetchImpl(
        `/api/watchlist?item_type=${encodeURIComponent(itemType)}`,
        { headers: options.authHeader }
      );
      if (!resp.ok) return new Map<string, WatchMembershipEntry>();
      const body = (await resp.json()) as WatchlistListResponse;
      const watched = new Set(body.watchedIds ?? []);
      const team = new Set(body.teamWatchedIds ?? []);
      const teamAvailable = !!body.teamAvailable;
      const map = new Map<string, WatchMembershipEntry>();
      for (const id of watched) map.set(id, { watched: true, teamWatched: team.has(id), teamAvailable });
      for (const id of team) {
        const existing = map.get(id);
        if (existing) existing.teamWatched = true;
        else map.set(id, { watched: false, teamWatched: true, teamAvailable });
      }
      return map;
    } catch {
      return new Map<string, WatchMembershipEntry>();
    }
  })();
  clientCache.set(itemType, promise);
  return promise;
}

/** Test-only: drops the module-level cache so each test starts clean. Never called from
 *  production code (there is no legitimate reason to invalidate a page-lifetime read cache from
 *  inside the app itself — see this module's header). */
export function __resetClientWatchMembershipCacheForTests(): void {
  clientCache.clear();
}
