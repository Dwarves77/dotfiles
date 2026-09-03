// Shared "load a detail page" shape for the four intelligence-surface detail
// routes: /regulations/[slug], /market/[slug], /operations/[slug],
// /research/[slug].
//
// WHY THIS EXISTS (perf lane, 2026-09-03, docs/audits/perf-load-times-2026-09-03.md
// §4/§6): each detail page.tsx was hand-mirrored from /regulations/[slug] —
// same UUID→legacy_id redirect lookup, same fetchIntelligenceItem +
// canonicalSurface admission guard, same relevance call, then a surface-
// specific tail of 2-6 MORE Supabase reads, every one of them a SEQUENTIAL
// `await`, each opening its OWN `createClient()`. The audit measured
// 1.26-1.91s server render per click, ~85-95% of it this fan-out. Hand-
// mirroring is exactly how the sequential shape spread to all four pages
// unnoticed — one file fixed in isolation would have left the other three
// exactly as slow. This module is the one home for the shared shape; each
// page supplies only what's actually different about its surface.
//
// THE SPLIT (binding correctness rule, not a style choice):
//   - loadItemScoped(ctx)   — the item-scoped, ORG-INDEPENDENT reads (related
//     items, price board, matrix eligibility, theme brief, peers-strip entity,
//     ...). Runs inside ONE cache entry keyed by (surface, id), tagged
//     itemTag(id) + surfaceDetailTag(surface), 300s revalidate backstop —
//     mirrors the existing fetchIntelligenceItem / fetchIntelligenceItemSections
//     caches in supabase-server.ts exactly. `ctx` carries `supabase`,
//     `resource`, `connections`, `supersessions` — NOTHING viewer- or
//     org-scoped. See load-detail-core.test.mjs's "no org/user key" proof: it
//     asserts the ctx object passed to loadItemScoped has no
//     orgId/userId/viewerId property, by construction (the type doesn't have
//     one to pass), so a cached payload can never carry another org's
//     relevance, notes, watchlist state, or owner.
//   - loadViewerScoped(ctx) — the per-org reads (today: only the regulations
//     owner lookup and the market note lookup carry one). Runs UNCACHED,
//     every request, in parallel with the cached item-scoped call — never
//     inside the cache closure.
//   - relevance (getViewerRelevanceForItem) is always uncached, always
//     viewer-scoped, runs in the same parallel batch. It was already a
//     stand-alone per-request call before this lane (viewer-relevance.ts's
//     own header explains why) — unchanged here, just parallelized with
//     everything else instead of `await`ed in sequence.
//
// fetchIntelligenceItem / fetchIntelligenceItemSections stay exactly as they
// were (already unstable_cache-wrapped) — this module composes them, it does
// not reimplement them. THE canonical service-role client (getServiceSupabase,
// supabase-service.ts) replaces the fresh-createClient()-per-block pattern
// every detail page used to hand-roll — that file's own header already names
// the detail-route fan-out as the reason it exists ("The detail-route
// prefetch fan-out built a fresh client per render... pure churn under
// burst"); this lane is the first to actually route the detail pages through
// it.
//
// THE ACTUAL CONTROL FLOW (concurrency, cache reuse, org isolation) lives in
// load-detail-core.ts, which imports NOTHING from next/* or @supabase/supabase-js
// at runtime — only `import type`, fully erased — so it, and only it, can be
// exercised by a plain `node --test` process (load-detail-core.test.mjs).
// THIS file is the thin composition layer: it imports the real Next/Supabase
// bindings and wires them into loadDetailCore's `deps`. It cannot itself be
// loaded outside Next's bundler (it value-imports next/cache), so it carries
// no test of its own — there's nothing here to test beyond "does this call
// the right function with the right arguments," and load-detail-core.test.mjs
// already exercises that shape with equivalent stub deps.
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchIntelligenceItem,
  fetchIntelligenceItemSections,
  type IntelligenceItemSectionRow,
} from "@/lib/supabase-server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getViewerRelevanceForItem } from "@/lib/workspace/viewer-relevance";
import { itemTag, surfaceDetailTag } from "@/lib/cache/revalidate-item";
import type { DetailSurface } from "@/lib/item-links";
import type { ItemRelevance } from "@/lib/workspace/profile";
import {
  loadDetailCore,
  DETAIL_CACHE_REVALIDATE_SECONDS,
  type ItemScopedCtx,
  type ViewerScopedCtx,
  type DetailDeps,
  type DetailCoreResult,
} from "./load-detail-core";

export { DETAIL_CACHE_REVALIDATE_SECONDS };
export type { ItemScopedCtx, ViewerScopedCtx, DetailDeps };

function defaultCreateServiceClient(): SupabaseClient | null {
  try {
    // getServiceSupabase() is fail-closed (throws when SUPABASE_SERVICE_ROLE_KEY
    // is unset) by design (supabase-service.ts header). Every existing detail-
    // page call site treats "no service client" as a soft-fail (skip the block,
    // render without that data), so the throw is caught and translated to null
    // here rather than propagated — preserves that contract exactly.
    return getServiceSupabase();
  } catch {
    return null;
  }
}

const defaultDetailDeps: DetailDeps = {
  createServiceClient: defaultCreateServiceClient,
  resolveOrgId: resolveOrgIdFromCookies,
  cacheWrap: (keyParts, tags, fn) =>
    unstable_cache(fn, keyParts, {
      tags,
      revalidate: DETAIL_CACHE_REVALIDATE_SECONDS,
    }),
  fetchItem: fetchIntelligenceItem,
  fetchSections: fetchIntelligenceItemSections,
  // Adapter, not a direct assignment: loadDetailCore's DetailDeps keeps
  // getRelevance's input typed `unknown` (the core has no runtime import of
  // viewer-relevance.ts's RelevanceInput type to narrow with) — this cast is
  // safe because the only caller is loadDetailCore itself, which always
  // passes through fetchIntelligenceItem's own relevanceInput field.
  getRelevance: (relevanceInput: unknown) =>
    getViewerRelevanceForItem(relevanceInput as Parameters<typeof getViewerRelevanceForItem>[0]),
};

export interface LoadDetailConfig<ItemScoped, ViewerScoped> {
  surface: DetailSurface;
  /** UI-side id (legacy_id || uuid), already decodeURIComponent'd by the
   *  caller. */
  id: string;
  loadItemScoped: (ctx: ItemScopedCtx) => Promise<ItemScoped>;
  loadViewerScoped?: (ctx: ViewerScopedCtx) => Promise<ViewerScoped>;
  /** Test-only override; production callers never pass this. */
  deps?: Partial<DetailDeps>;
}

/** DetailCoreResult with `sections`/`relevance` narrowed to their real types
 *  (the core leaves them `unknown` — it has no runtime import of
 *  supabase-server.ts's or profile.ts's types to narrow with). Safe to
 *  narrow here: fetchIntelligenceItemSections and getViewerRelevanceForItem
 *  are exactly what populates those fields (defaultDetailDeps above), and a
 *  `deps` override in a test never flows through this typed wrapper — tests
 *  call loadDetailCore directly. */
export type DetailResult<ItemScoped, ViewerScoped> = Extract<
  DetailCoreResult<ItemScoped, ViewerScoped>,
  { notFound: true }
> | (Omit<Extract<DetailCoreResult<ItemScoped, ViewerScoped>, { notFound: false }>, "sections" | "relevance"> & {
    sections: IntelligenceItemSectionRow[];
    relevance: ItemRelevance | null;
  });

/** Load one detail page's data. See the module header for the design; see
 *  load-detail-core.ts for the control flow this delegates to. Production
 *  call sites (the four detail page.tsx files) call this with no `deps` —
 *  the real Next/Supabase bindings above are used. */
export async function loadDetail<ItemScoped, ViewerScoped = undefined>(
  config: LoadDetailConfig<ItemScoped, ViewerScoped>
): Promise<DetailResult<ItemScoped, ViewerScoped>> {
  const deps: DetailDeps = { ...defaultDetailDeps, ...config.deps };
  const result = await loadDetailCore({
    surface: config.surface,
    id: config.id,
    loadItemScoped: config.loadItemScoped,
    loadViewerScoped: config.loadViewerScoped,
    deps,
    cacheKeyParts: ["detail-item-scoped", config.surface, config.id],
    cacheTags: [itemTag(config.id), surfaceDetailTag(config.surface)],
  });
  return result as DetailResult<ItemScoped, ViewerScoped>;
}
