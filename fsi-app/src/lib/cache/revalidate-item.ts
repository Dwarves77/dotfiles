// Detail-cache invalidation for the /regulations/[slug] detail route.
//
// The per-item detail fetchers in supabase-server.ts (fetchIntelligenceItem /
// fetchIntelligenceItemSections) are wrapped in unstable_cache with two tags:
//   - itemTag(id)      — precise, per-item (`item:{id}`)
//   - INTEL_ITEMS_TAG  — coarse, all detail caches (`intel-items`)
// plus a 300s revalidate backstop. Tag invalidation gives prompt freshness on
// top of that time backstop.
//
// SCOPE NOTE: revalidateTag must run in a request/route or server-action scope
// (it needs Next's work-unit async store, which raw Vercel Workflow steps do
// NOT populate). So this helper is invoked from a Route Handler
// (/api/cache/revalidate-item), never directly from a "use step" body. The
// generate-brief workflow reaches it best-effort over HTTP on its terminal
// path; a failed call never affects the run because the 300s revalidate
// backstop bounds staleness regardless.
import { revalidateTag } from "next/cache";

/** Coarse tag on every per-item detail cache entry. Flushing it is
 *  id-independent — it invalidates the detail cache whether it was keyed by
 *  legacy_id or uuid. This is the correctness-bearing flush for the generation
 *  pipeline, which only holds the item's UUID. */
export const INTEL_ITEMS_TAG = "intel-items";

/** Precise per-item tag. `id` is the UI-side id (legacy_id || uuid) the detail
 *  route reads by; id-aware callers can flush exactly one item. */
export function itemTag(id: string): string {
  return `item:${id}`;
}

/** Invalidate the detail cache for one item: the precise per-item tag AND the
 *  coarse all-items tag. Safe to call with either the UI-side id or the UUID —
 *  the coarse tag guarantees the flush lands regardless of which id form keyed
 *  the cache entry. Must be called from a route/server-action scope. */
export function revalidateItem(id: string): void {
  revalidateTag(itemTag(id), "max");
  revalidateTag(INTEL_ITEMS_TAG, "max");
}
