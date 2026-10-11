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
