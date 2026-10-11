import type { SupabaseClient } from "@supabase/supabase-js";

type ResourceLookup = Record<string, { id: string; title: string; priority: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UI-side id (legacy_id || uuid) → the row's real uuid. Every detail page needs this before querying a
 *  uuid-typed FK column (workspace_item_overrides.item_id, published_price_statistics.item_id, ...) — `id`
 *  itself may already be the legacy slug. Returns null on any read error or no match (fail-soft; callers
 *  already treat a null uuid as "skip this block"). */
export async function resolveItemUuid(supabase: SupabaseClient, id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const { data, error } = await supabase.from("intelligence_items").select("id").eq("legacy_id", id).maybeSingle();
  if (error) {
    console.warn(`[resource-lookup] resolveItemUuid read failed (caller skips the uuid-keyed block): ${error.message}`);
    return null;
  }
  return data?.id ?? null;
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
          // fitness-allow: F39 (relatedIds is one detail page's own related-items widget list, small by construction)
          .eq("provenance_status", "verified").in("legacy_id", legacyIds)
      );
    }
    if (uuidIds.length > 0) {
      queries.push(
        supabase.from("intelligence_items").select("id, legacy_id, title, priority")
          // fitness-allow: F39 (relatedIds is one detail page's own related-items widget list, small by construction)
          .eq("provenance_status", "verified").in("id", uuidIds)
      );
    }
    const results = await Promise.all(queries);
    for (const result of results) {
      if (result.error) {
        console.warn(`[resource-lookup] buildResourceLookup read failed (those ids render with the raw-id fallback): ${result.error.message}`);
        continue;
      }
      for (const row of (result.data ?? []) as Array<{ id: string; legacy_id: string | null; title: string; priority: string }>) {
        const uiId = row.legacy_id || row.id;
        lookup[uiId] = { id: uiId, title: row.title, priority: row.priority };
      }
    }
  } catch (e) {
    // Fail-soft — connections/supersessions render with a raw-id fallback (or are dropped, per
    // buildConnectionRows) rather than the page failing. Logged so the miss is not silent.
    console.warn(`[resource-lookup] buildResourceLookup threw (connections render with the raw-id fallback): ${e instanceof Error ? e.message : String(e)}`);
  }
  return lookup;
}
