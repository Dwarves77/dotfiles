// resource-lookup.ts — flywheel U9 (D1) shared helper. Extracted from the pattern originally inline in
// regulations/[slug]/page.tsx (customer read gate on related-item titles) so Market/Operations/Research
// don't each re-implement the same ~40 lines when wiring ItemConnectionsCard (one home, not four).
//
// Customer read gate: only verified items may surface titles in a connections list. A quarantined
// connection/supersession target falls back to its raw id (buildConnectionRows/buildSupersessionRows in
// connection-view-model.mjs tolerate a missing lookup entry) rather than leaking an unverified title.
//
// PERF lane (2026-09-03): buildResourceLookup was already the shared home for the related-items title
// query, but regulations/[slug]/page.tsx had never been migrated onto it — it carried its own byte-for-
// byte copy (same query shape, same provenance gate) inline, which is exactly the hand-mirroring pattern
// docs/audits/perf-load-times-2026-09-03.md §6 names as how the sequential-fan-out shape spread unnoticed.
// Fixed in the same pass as the fan-out itself (src/lib/detail/load-detail.ts): regulations now calls this
// function too. Signature changed from `(relatedIds)` to `(supabase, relatedIds)` — the four detail pages'
// item-scoped bundles (load-detail.ts's ItemScopedCtx) already hold ONE service-role client per render
// (THE canonical one, supabase-service.ts's getServiceSupabase, memoized) instead of each helper opening
// its own; all 3 prior call sites (market/operations/research) are updated in the same commit. Two more
// one-line-each helpers added below for the SAME reason — resolveItemUuid (legacy_id-or-uuid → uuid) and
// fetchInstrumentEntityId (uuid → the peers-strip's bound entity) were each hand-copied 2-3 times across
// the four detail pages (owner lookup, note lookup, price board, peers strip).

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceLookup = Record<string, { id: string; title: string; priority: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UI-side id (legacy_id || uuid) → the row's real uuid. Every detail page needs this before querying a
 *  uuid-typed FK column (workspace_item_overrides.item_id, published_price_statistics.item_id, ...) — `id`
 *  itself may already be the legacy slug. Returns null on any read error or no match (fail-soft; callers
 *  already treat a null uuid as "skip this block"). */
export async function resolveItemUuid(supabase: SupabaseClient, id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const { data } = await supabase.from("intelligence_items").select("id").eq("legacy_id", id).maybeSingle();
  return data?.id ?? null;
}

/** The peers-strip's bound entity for one item (lane COMMUNITY-B, wave3 2026-09-03) — reads
 *  intelligence_items.instrument_entity_id for the given uuid. Fail-soft to null (PeersDiscussingStrip
 *  renders nothing for a null entityId). */
export async function fetchInstrumentEntityId(
  supabase: SupabaseClient,
  itemUuid: string
): Promise<string | null> {
  const { data } = await supabase
    .from("intelligence_items")
    .select("instrument_entity_id")
    .eq("id", itemUuid)
    .maybeSingle();
  return data?.instrument_entity_id ?? null;
}

/** Fetch title + priority for a set of UI-side ids (legacy_id || uuid), verified items only.
 *  Fail-soft: any error returns an empty lookup — callers already tolerate a miss. */
export async function buildResourceLookup(
  supabase: SupabaseClient,
  relatedIds: string[]
): Promise<ResourceLookup> {
  const lookup: ResourceLookup = {};
  const ids = Array.from(new Set(relatedIds)).filter(Boolean);
  if (!ids.length) {
    return lookup;
  }
  try {
    const uuidIds = ids.filter((id) => UUID_RE.test(id));
    const legacyIds = ids.filter((id) => !UUID_RE.test(id));

    const queries = [];
    if (legacyIds.length > 0) {
      queries.push(
        supabase.from("intelligence_items").select("id, legacy_id, title, priority")
          .eq("provenance_status", "verified").in("legacy_id", legacyIds)
      );
    }
    if (uuidIds.length > 0) {
      queries.push(
        supabase.from("intelligence_items").select("id, legacy_id, title, priority")
          .eq("provenance_status", "verified").in("id", uuidIds)
      );
    }
    const results = await Promise.all(queries);
    for (const result of results) {
      for (const row of (result.data ?? []) as Array<{ id: string; legacy_id: string | null; title: string; priority: string }>) {
        const uiId = row.legacy_id || row.id;
        lookup[uiId] = { id: uiId, title: row.title, priority: row.priority };
      }
    }
  } catch {
    // Fail-soft — connections/supersessions render with a raw-id fallback (or are dropped, per
    // buildConnectionRows) rather than the page failing.
  }
  return lookup;
}
