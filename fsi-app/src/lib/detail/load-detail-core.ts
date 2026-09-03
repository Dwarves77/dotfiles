// Pure control-flow core for "load a detail page" — see load-detail.ts's
// header for the full design rationale (the split across item-scoped/viewer-
// scoped, the cache-tag scheme, why this shared shape exists at all).
//
// Split out from load-detail.ts SPECIFICALLY so this file issues ZERO
// runtime (value) imports of next/* or @supabase/supabase-js: every such
// binding (unstable_cache, the service-role client, resolveOrgIdFromCookies,
// fetchIntelligenceItem/Sections, relevance) arrives only through the
// REQUIRED `deps` parameter — real bindings come from load-detail.ts for
// production callers, stubs from load-detail-core.test.mjs. The concrete
// domain types (Resource, ItemConnection, ...) ARE imported below, but only
// as `import type` — TypeScript type-only imports are erased entirely by
// Node's built-in type-stripping (verified empirically: an `import type`
// from a nonexistent path, or from `next/cache` itself, loads fine under
// plain `node --test` because the import statement is removed before the
// module ever tries to resolve it), so this file stays free of the ESM
// resolution problem that blocks value imports of `next/*` (see below) while
// still getting full type safety wherever `.ts` tooling (tsc, editors) reads
// it.
//
// WHY THE SPLIT IS NECESSARY, NOT STYLISTIC: the `next` package ships no
// package.json "exports" map, so Node's ESM loader cannot resolve the bare
// extensionless specifier `next/cache` outside of Next's own bundler
// (confirmed empirically: `node --test` on a file with `import { unstable_cache }
// from "next/cache"` throws ERR_MODULE_NOT_FOUND, suggesting the literal
// `next/cache.js` path — webpack resolves the bare specifier fine via its own
// resolver, but plain node does not). Any module that VALUE-imports
// `next/cache` (or anything that transitively does, like supabase-server.ts)
// cannot be loaded by any `node --test` process, npm-deps job or not. Keeping
// this core free of that import is what makes the (a)/(b)/(c) structural
// proof (perf-lane brief task 6) actually runnable as a plain, portable
// *.test.mjs — no *.npmtest.mjs / CI-npm-step wiring needed at all.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Resource,
  Supersession,
  ItemConnection,
  ChangeLogEntry,
  Dispute,
} from "@/types/resource";

/** Time backstop on the item-scoped cache entry — matches the 300s window
 *  already used by fetchIntelligenceItem / fetchIntelligenceItemSections
 *  (supabase-server.ts) so all three caches for one item drift stale
 *  together, not on three different clocks. Re-exported by load-detail.ts,
 *  which is where it's actually consumed (unstable_cache's `revalidate`
 *  option) — defined here so both files read the same constant. */
export const DETAIL_CACHE_REVALIDATE_SECONDS = 300;

/** The shape fetchIntelligenceItem already returns (supabase-server.ts).
 *  Restated structurally here (not imported as a value) so this file has no
 *  runtime dependency on supabase-server.ts, which itself value-imports
 *  next/cache. */
export interface DetailSourceItem {
  resource: Resource;
  changelog: ChangeLogEntry[];
  dispute: Dispute | null;
  supersessions: Supersession[];
  connections: ItemConnection[];
  relevanceInput: unknown;
  canonicalSurface: string;
}

/** What a surface's loadItemScoped callback receives. Deliberately narrow: no
 *  orgId, no userId, no cookies/session on this ctx — a cached payload built
 *  from it can never carry another org's relevance, notes, watchlist state,
 *  or owner, because the ctx has nowhere to put one. */
export interface ItemScopedCtx {
  supabase: SupabaseClient;
  resource: Resource;
  connections: ItemConnection[];
  supersessions: Supersession[];
}

export interface ViewerScopedCtx {
  supabase: SupabaseClient;
  orgId: string | null;
  resource: Resource;
}

export interface DetailDeps {
  /** Returns null (never throws) when the service-role client is
   *  unavailable — callers already tolerate a null client (soft-fail,
   *  matching every detail page's prior try/catch-around-a-fresh-
   *  createClient() posture). */
  createServiceClient: () => SupabaseClient | null;
  resolveOrgId: () => Promise<string | null>;
  /** Wraps the item-scoped bundle in a cache, keyed by keyParts. Real
   *  default (load-detail.ts): unstable_cache, 300s revalidate, tagged
   *  itemTag(id) + surfaceDetailTag(surface). Tests substitute an in-memory
   *  memoizer keyed the same way, so cache-hit behavior is provable without
   *  Next's request-scope requirement. */
  cacheWrap: <T>(keyParts: string[], tags: string[], fn: () => Promise<T>) => () => Promise<T>;
  fetchItem: (id: string) => Promise<DetailSourceItem | null>;
  fetchSections: (id: string) => Promise<unknown>;
  getRelevance: (relevanceInput: unknown) => Promise<unknown | null>;
}

export interface LoadDetailCoreConfig<ItemScoped, ViewerScoped> {
  surface: string;
  /** UI-side id (legacy_id || uuid), already decodeURIComponent'd by the
   *  caller — same value fetchIntelligenceItem/fetchIntelligenceItemSections
   *  take. */
  id: string;
  /** The item-scoped, org-independent read set for this surface. Run inside
   *  the shared cache entry — implementations should run their own internal
   *  Promise.all across whatever independent queries they issue (the cache
   *  entry is one unit, but nothing requires it to be one query). */
  loadItemScoped: (ctx: ItemScopedCtx) => Promise<ItemScoped>;
  /** The viewer-scoped, per-org read set for this surface (owner, note, ...).
   *  Omit when the surface has none (operations, research today — neither
   *  fetches anything org-scoped beyond the always-on relevance lens). Runs
   *  UNCACHED, every request. */
  loadViewerScoped?: (ctx: ViewerScopedCtx) => Promise<ViewerScoped>;
  deps: DetailDeps;
  /** Cache key/tag builders — kept out of this file as raw string arrays
   *  (no itemTag/surfaceDetailTag import here) so the core imports nothing
   *  from @/lib either. */
  cacheKeyParts: string[];
  cacheTags: string[];
}

export type DetailCoreResult<ItemScoped, ViewerScoped> =
  | { notFound: true }
  | {
      notFound: false;
      resource: Resource;
      connections: ItemConnection[];
      supersessions: Supersession[];
      changelog: ChangeLogEntry[];
      dispute: Dispute | null;
      sections: unknown;
      itemScoped: ItemScoped | null;
      viewerScoped: ViewerScoped | undefined;
      relevance: unknown | null;
      elapsedMs: number;
    };

/**
 * Load one detail page's data: the shared admission guard + shared cached
 * calls (fetchItem, fetchSections) run first, then the surface's item-scoped
 * bundle (cache-wrapped) and its viewer-scoped bundle + relevance run IN
 * PARALLEL via Promise.all instead of as sequential awaits — collapsing the
 * 6-9 sequential Supabase round trips docs/audits/perf-load-times-2026-09-03.md
 * §4 measured into at most two round-trip widths (the item-scoped bundle's own
 * internal Promise.all, and the viewer-scoped bundle's).
 *
 * Returns `{ notFound: true }` when the item doesn't exist or doesn't belong
 * to this surface — the caller (load-detail.ts, then the page itself) is
 * responsible for calling next/navigation's notFound(); this core never
 * imports it.
 */
export async function loadDetailCore<ItemScoped, ViewerScoped = undefined>(
  config: LoadDetailCoreConfig<ItemScoped, ViewerScoped>
): Promise<DetailCoreResult<ItemScoped, ViewerScoped>> {
  const { deps } = config;
  const t0 = Date.now();

  const detail = await deps.fetchItem(config.id);
  if (!detail || detail.canonicalSurface !== config.surface) {
    return { notFound: true };
  }
  const { resource, connections, supersessions, relevanceInput, changelog, dispute } = detail;

  const runItemScoped = deps.cacheWrap(
    config.cacheKeyParts,
    config.cacheTags,
    async (): Promise<ItemScoped | null> => {
      const supabase = deps.createServiceClient();
      if (!supabase) return null;
      return config.loadItemScoped({ supabase, resource, connections, supersessions });
    }
  );

  const runViewerScoped = async (): Promise<{
    relevance: unknown | null;
    viewerScoped: ViewerScoped | undefined;
  }> => {
    const relevance = await deps.getRelevance(relevanceInput);
    let viewerScoped: ViewerScoped | undefined;
    if (config.loadViewerScoped) {
      const supabase = deps.createServiceClient();
      if (supabase) {
        const orgId = await deps.resolveOrgId();
        viewerScoped = await config.loadViewerScoped({ supabase, orgId, resource });
      }
    }
    return { relevance, viewerScoped };
  };

  const [sections, itemScoped, viewer] = await Promise.all([
    deps.fetchSections(config.id),
    runItemScoped(),
    runViewerScoped(),
  ]);

  return {
    notFound: false,
    resource,
    connections,
    supersessions,
    changelog,
    dispute,
    sections,
    itemScoped,
    viewerScoped: viewer.viewerScoped,
    relevance: viewer.relevance,
    elapsedMs: Date.now() - t0,
  };
}
