import { unstable_cache } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchIntelligenceItem,
  fetchIntelligenceItemSections,
  fetchFreshInferencesForItem,
  type IntelligenceItemSectionRow,
} from "@/lib/supabase-server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveItemUuid } from "@/lib/connections/resource-lookup";
import { loadSuppressedClaims, redactSuppressedClaims } from "@/lib/corrections/suppressed-render.mjs";
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
import { ID_REDIRECT_COLUMNS, resolveIdRedirect, type IdRedirectRow } from "./id-redirect";

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
  // lane DFIX-2: inferences are read per request, never inside the 300 s item-scoped cache entry.
  freshInferences: async (id) => {
    const sb = defaultCreateServiceClient();
    return sb ? fetchFreshInferencesForItem(sb, id) : null;
  },
  // lane G7-CORR: a claim an admin suppressed is removed from the rendered sections and full brief at read time.
  redactDetail: async ({ id, resource, sections }) => {
    const sb = defaultCreateServiceClient();
    if (!sb) return { resource, sections };
    const uuid = await resolveItemUuid(sb, id);
    if (!uuid) return { resource, sections };
    const claims = await loadSuppressedClaims(sb, [uuid]);
    if (!claims.length) return { resource, sections };
    const r = redactSuppressedClaims({
      sections: sections as Array<{ id?: string; content_md?: string }>,
      fullBrief: (resource as { fullBrief?: string }).fullBrief,
      claims,
    });
    return { resource: { ...(resource as object), fullBrief: r.fullBrief }, sections: r.sections };
  },
};

interface LoadDetailConfig<ItemScoped, ViewerScoped> {
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
type DetailResult<ItemScoped, ViewerScoped> = Extract<
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

/** The uuid lookup behind applyIdRedirect. Throws on a missing service client or a PostgREST error (the
 *  `error` is destructured, never dropped: fsi-app/.claude/CLAUDE.md's agent/run error-swallow post-mortem);
 *  resolveIdRedirect turns a throw into "render", so loadDetail keeps the final, fail-closed say. */
async function lookupItemForIdRedirect(uuid: string): Promise<IdRedirectRow | null> {
  const { data, error } = await getServiceSupabase()
    .from("intelligence_items")
    .select(ID_REDIRECT_COLUMNS)
    .eq("id", uuid)
    .maybeSingle();
  if (error) throw new Error(`id-redirect lookup failed: ${error.message}`);
  return (data as IdRedirectRow | null) ?? null;
}

/** Lane REG-REDIRECT (2026-09-24): the uuid -> slug step every `[slug]` page runs before loadDetail. It
 *  redirects only to a URL that renders, and calls notFound() at the uuid URL for an item no surface admits
 *  (see id-redirect.ts for the rule and the defect it replaces). Must be awaited OUTSIDE any try/catch in
 *  the page: redirect() and notFound() throw Next's control-flow errors. It cannot join loadDetail's
 *  parallel bundle, since it decides whether that load happens at this URL at all. */
export async function applyIdRedirect(surface: DetailSurface, id: string): Promise<void> {
  const decision = await resolveIdRedirect(surface, id, lookupItemForIdRedirect);
  if (decision.kind === "redirect") redirect(decision.to);
  if (decision.kind === "not-found") notFound();
}
