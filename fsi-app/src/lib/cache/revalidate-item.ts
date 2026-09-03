// Detail-cache invalidation for the four intelligence-surface detail routes
// (/regulations/[slug], /market/[slug], /operations/[slug], /research/[slug]).
//
// The per-item detail fetchers in supabase-server.ts (fetchIntelligenceItem /
// fetchIntelligenceItemSections) are wrapped in unstable_cache with two tags:
//   - itemTag(id)      — precise, per-item (`item:{id}`)
//   - INTEL_ITEMS_TAG  — coarse, all detail caches (`intel-items`)
// plus a 300s revalidate backstop. Tag invalidation gives prompt freshness on
// top of that time backstop.
//
// PERF lane (2026-09-03): src/lib/detail/load-detail.ts adds a THIRD cache
// entry per detail render — the surface's item-scoped (org-independent) query
// bundle (related items, price board, matrix eligibility, theme brief, etc.,
// varies per surface — see that module's header). It is tagged with
// itemTag(id) (so the existing per-item flush below still reaches it) PLUS
// surfaceDetailTag(surface) (so a surface-wide flush — e.g. a population run
// that reclassifies many items at once and holds no id list — can drop every
// item-scoped detail-cache entry for that surface without enumerating ids).
// surfaceDetailTag is exported here, not redefined in load-detail.ts, so both
// the item-level and surface-level tag vocabularies live in one file.
//
// SCOPE NOTE: revalidateTag must run in a request/route or server-action scope
// (it needs Next's work-unit async store, which raw Vercel Workflow steps do
// NOT populate). So this helper is invoked from a Route Handler
// (/api/cache/revalidate-item), never directly from a "use step" body. The
// generate-brief workflow reaches it best-effort over HTTP on its terminal
// path; a failed call never affects the run because the 300s revalidate
// backstop bounds staleness regardless.
import { revalidateTag } from "next/cache";
import type { DetailSurface } from "@/lib/item-links";

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

/** Coarse per-surface tag on the item-scoped detail-query cache entries
 *  load-detail.ts writes (`<surface>-detail`, e.g. `regulations-detail`).
 *  Flushing it drops every item-scoped detail cache entry for that surface —
 *  for a population run that touches many items without holding an id list
 *  (mirrors INTEL_ITEMS_TAG's coarse role, scoped to one surface instead of
 *  all four). */
export function surfaceDetailTag(surface: DetailSurface): string {
  return `${surface}-detail`;
}

/** Invalidate the detail cache for one item: the precise per-item tag AND the
 *  coarse all-items tag. Safe to call with either the UI-side id or the UUID —
 *  the coarse tag guarantees the flush lands regardless of which id form keyed
 *  the cache entry. Must be called from a route/server-action scope. */
export function revalidateItem(id: string): void {
  revalidateTag(itemTag(id), "max");
  revalidateTag(INTEL_ITEMS_TAG, "max");
}
