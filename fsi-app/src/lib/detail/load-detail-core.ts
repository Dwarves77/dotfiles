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
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";

/** Time backstop on the item-scoped cache entry (unstable_cache's `revalidate` — a
 *  stale-while-revalidate window, not a hard TTL: nextjs.org/docs/app/api-reference/functions/
 *  unstable_cache; a request past the window gets the STALE value immediately while Next
 *  regenerates in the background for the next one).
 *
 *  PERF-13 (2026-09-04, ADR-027 §1, operator: "with tag revalidation on mint, a long revalidate
 *  (hours) plus stale-while-revalidate is the standard"): raised from 300s. This cache entry is
 *  tagged `itemTag(id)` + `surfaceDetailTag(surface)` (load-detail.ts, below) and
 *  `scripts/mint/apply-mint-batch.mjs` already calls `revalidateTag(surfaceDetailTag(...))` for
 *  all four surfaces at the single mint-apply completion point (confirmed this lane) — so a real
 *  content change is already event-driven, not time-driven, and this window only needs to be a
 *  safety net wide enough to be cheap, not tight enough to matter. Kept separate from
 *  `PUBLIC_ITEMS_REVALIDATE_SECONDS` (data.ts, 6h) rather than importing it: this constant lives in
 *  a file that deliberately carries zero `next/*` value-imports (see this file's own header) and a
 *  detail page's own content is read far more selectively than a listing page's, so a slightly
 *  shorter backstop (1h) costs nothing and leaves headroom if the two are ever tuned independently. */
export const DETAIL_CACHE_REVALIDATE_SECONDS = 60 * 60; // 1 hour

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
  /** PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): when `false` (the default), skips
   *  `deps.getRelevance` entirely — `relevance` resolves to `null` and NO Dynamic API call happens
   *  for it in this page's own server render. Before this lane, `deps.getRelevance` ran
   *  UNCONDITIONALLY for every surface (even operations/research, which have no `loadViewerScoped` of
   *  their own) — it was the single most universal cause of all four detail routes building `ƒ`
   *  (see GET /api/detail/relevance's header for the client-fetch replacement and why relevance,
   *  being genuinely per-viewer, cannot become a shared cache entry the way the item listing itself
   *  can). Default `false` rather than `true` because every production call site (the four detail
   *  page.tsx files) opts OUT after this lane; a test exercising the old unconditional-call shape
   *  passes `includeRelevance: true` explicitly (see load-detail-core.test.mjs). */
  includeRelevance?: boolean;
}

// ── TIER-CHIP lane (2026-09-04): the record-grade claim-tier read ──────────────────────────────────
//
// THE GAP this closes (see parse-record-sections.ts's own TIER-CHIP header for the full derivation
// rationale): a record-grade item's FACT claims (section_claim_provenance) each resolve to a real source
// tier, but no page ever read it — RecordFactLine had nothing to render. This is that read, factored out
// ONCE here because THREE surfaces (regulations, market, research — never operations, which has no
// record-grade renderer) need the identical query/shape; each surface's own loadItemScoped calls
// `fetchClaimTierMap` inside its own Promise.all (see e.g. regulations/[slug]/page.tsx), so it runs
// alongside that surface's other item-scoped reads, inside the SAME cache entry loadDetailCore already
// wraps — one extra query per cache miss, never per-claim (no N+1), and free on every cache hit exactly
// like the rest of that bundle.
//
// ONE QUERY, NOT A JOIN-PER-CLAIM: PostgREST resource embedding (`sources(...)` — section_claim_provenance
// carries a real FK, section_claim_provenance_source_id_fkey -> sources.id, confirmed via Supabase MCP
// read-only, 2026-09-04) resolves the claim ↔ source join server-side in ONE HTTP round trip, the same
// embedding idiom already used throughout this codebase (supabase-server.ts's `source:sources(...)`,
// operations/[slug]/page.tsx, research/[slug]/page.tsx — grepped for precedent before writing this).
//
// THE RATING FIELD, STATED (do not read effective_tier here — see parse-record-sections.ts's header for
// the full citation): `COALESCE(sources.tier_override, sources.base_tier)` is the SAME derivation
// `validate_item_provenance` criterion 3 uses as of migration 145 ("moat-pure": reputation, i.e.
// effective_tier, can never confer reg-fact eligibility) — never the stored, pre-145
// `section_claim_provenance.source_tier_at_grounding` cache the validator no longer consumes either.
export interface ClaimTierSourceRowLike {
  name: string | null;
  url: string | null;
  base_tier: number | null;
  tier_override: number | null;
}

export interface ClaimTierRowLike {
  claim_text: string;
  // PostgREST returns a single embedded resource as an object when the FK is unambiguous (confirmed:
  // section_claim_provenance carries exactly one FK to sources), but this repo's own established
  // defensive idiom (supabase-server.ts's fetchResearchPipelineRows: `Array.isArray(row.source) ?
  // row.source[0] : row.source`) treats it as possibly-array anyway — followed here rather than assumed
  // away, since a null source_id also legitimately yields null here (a GAP claim, or a FACT whose
  // source_id never resolved).
  sources: ClaimTierSourceRowLike | ClaimTierSourceRowLike[] | null;
}

/** Build a ClaimTierMap from the raw joined rows a `section_claim_provenance` + embedded `sources` query
 *  returns. Pure — no I/O; the caller (fetchClaimTierMap below, or a test) supplies the rows. Keys the map
 *  by each row's own `claim_text` — BYTE-IDENTICAL to the `rawLine` parse-record-sections.ts derives from
 *  the same claim's content_md line (see that file's MATCH RULE), so no transform happens here beyond the
 *  tier derivation itself. A row whose `claim_text` repeats (should not happen — claim_text is effectively
 *  unique per item, one claim per slot per section) keeps the LAST row's rating, matching plain object
 *  key-assignment semantics; never silently drops one arbitrarily different from the other. */
export function buildClaimTierMap(rows: ClaimTierRowLike[] | null | undefined): ClaimTierMap {
  const map: ClaimTierMap = {};
  for (const row of rows ?? []) {
    if (!row || typeof row.claim_text !== "string") continue;
    const src = Array.isArray(row.sources) ? row.sources[0] ?? null : row.sources;
    map[row.claim_text] = {
      tier: src ? src.tier_override ?? src.base_tier ?? null : null,
      sourceName: src?.name ?? null,
      sourceUrl: src?.url ?? null,
    };
  }
  return map;
}

/**
 * Read a record-grade item's FACT claims' ratings in ONE query (see this section's header) and return
 * them as a ClaimTierMap ready for parseRecordSections. Never throws — a query error or a null/empty
 * `data` (including "this item has no section_claim_provenance rows at all", the honest common case for
 * every brief-grade item, since this is called unconditionally by each surface's loadItemScoped rather
 * than gated on item_grade) resolves to `{}`, the same "every fact renders unrated" state
 * parseRecordSections already treats as the correct default with no map at all.
 */
export async function fetchClaimTierMap(
  supabase: SupabaseClient,
  itemUuid: string
): Promise<ClaimTierMap> {
  try {
    const { data, error } = await supabase
      .from("section_claim_provenance")
      .select("claim_text, sources(name, url, base_tier, tier_override)")
      .eq("intelligence_item_id", itemUuid)
      .eq("claim_kind", "FACT");
    if (error || !data) return {};
    return buildClaimTierMap(data as unknown as ClaimTierRowLike[]);
  } catch {
    return {};
  }
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
    // PERF-10: see LoadDetailCoreConfig.includeRelevance's own doc — skipped by default.
    const relevance = config.includeRelevance ? await deps.getRelevance(relevanceInput) : null;
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
