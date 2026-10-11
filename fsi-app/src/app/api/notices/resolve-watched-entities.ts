export interface EntityResolveQueryBuilder {
  select(cols: string): EntityResolveQueryBuilder;
  eq(col: string, value: unknown): EntityResolveQueryBuilder;
  in(col: string, values: unknown[]): EntityResolveQueryBuilder;
  then<T>(onfulfilled: (value: { data: unknown; error: { message: string } | null }) => T): Promise<T>;
}

export interface EntityResolveClient {
  from(table: string): EntityResolveQueryBuilder;
}

/** One org_watchlist row, the only two fields this module reads. */
export interface WatchedItem {
  item_type: string;
  item_id: string;
}

/** item_types backed by an intelligence_items row (src/app/api/watchlist/logic.ts's ITEM_TYPES, minus
 *  'source' and 'market_series', which resolve through a different table or not at all — see header). */
const INTELLIGENCE_ITEM_TYPES = new Set(["reg", "signal", "research", "operations"]);

/**
 * Pure: split a raw org_watchlist read into the id sets each resolution query needs. Exported so the
 * grouping decision (which item_type resolves through which table) is independently testable without a
 * client at all. Deduplicates — the same intelligence_item id watched under two item_types (unusual, but
 * ITEM_TYPES does not forbid it) is looked up once, not once per row.
 */
export function groupWatchedItemIds(watched: WatchedItem[]): { intelligenceItemIds: string[]; sourceIds: string[] } {
  const intelligenceItemIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const w of watched ?? []) {
    if (!w?.item_id) continue;
    if (INTELLIGENCE_ITEM_TYPES.has(w.item_type)) {
      intelligenceItemIds.add(w.item_id);
    } else if (w.item_type === "source") {
      sourceIds.add(w.item_id);
    }
    // "market_series", or any future item_type this module does not yet know: contributes no entity id
    // (see header) — not an error, not silently mis-resolved as if it were an intelligence_item id.
  }
  return { intelligenceItemIds: [...intelligenceItemIds], sourceIds: [...sourceIds] };
}

/**
 * Resolve a batch of org_watchlist rows to the distinct entity ids they are about, via
 * `intelligence_items.instrument_entity_id`, `entity_refs` (role-agnostic — every row for the item is a
 * real asserted relationship, migration 283), and `sources.organisation_entity_id`. Never throws on a
 * query error — an error on either path yields fewer resolved ids, never a crash on what is, at worst, a
 * secondary feed (same fail-soft posture as fetchSupersededNotices itself).
 */
export async function resolveWatchedEntityIds(client: EntityResolveClient, watched: WatchedItem[]): Promise<string[]> {
  const { intelligenceItemIds, sourceIds } = groupWatchedItemIds(watched);
  const entityIds = new Set<string>();

  if (intelligenceItemIds.length > 0) {
    // fitness-allow: F39 (scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale)
    const itemsRes = await client.from("intelligence_items").select("id,instrument_entity_id").in("id", intelligenceItemIds);
    if (!itemsRes.error && Array.isArray(itemsRes.data)) {
      for (const row of itemsRes.data as Array<{ instrument_entity_id: string | null }>) {
        if (row.instrument_entity_id) entityIds.add(row.instrument_entity_id);
      }
    }

    // fitness-allow: F39 (scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale)
    const refsRes = await client.from("entity_refs").select("entity_id").eq("ref_table", "intelligence_items").in("ref_id", intelligenceItemIds);
    if (!refsRes.error && Array.isArray(refsRes.data)) {
      for (const row of refsRes.data as Array<{ entity_id: string }>) {
        if (row.entity_id) entityIds.add(row.entity_id);
      }
    }
  }

  if (sourceIds.length > 0) {
    // fitness-allow: F39 (scoped to one user's own watchlist/notices/org-membership rows, not corpus-scale)
    const sourcesRes = await client.from("sources").select("id,organisation_entity_id").in("id", sourceIds);
    if (!sourcesRes.error && Array.isArray(sourcesRes.data)) {
      for (const row of sourcesRes.data as Array<{ organisation_entity_id: string | null }>) {
        if (row.organisation_entity_id) entityIds.add(row.organisation_entity_id);
      }
    }
  }

  return [...entityIds];
}
