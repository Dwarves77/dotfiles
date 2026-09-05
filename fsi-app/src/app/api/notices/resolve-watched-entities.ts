// resolve-watched-entities.ts — the missing translation GET /api/notices needs between "what this org
// has watched" (org_watchlist) and "what fetchSupersededNotices() can actually filter by" (derived_values
// entity_id). Lane NOTICES, complete-system train, 2026-09-05.
//
// THE DEFECT THIS FILE FIXES [CONFIRMED against the live schema this session]. Before this file existed,
// route.ts built `entityIds` directly from `org_watchlist.item_id` and passed that array straight into
// `fetchSupersededNotices(supabase, entityIds, sinceIso)`, which filters `derived_values.entity_id IN
// (...)`. Those are two DIFFERENT id spaces that were never reconciled:
//   - `org_watchlist.item_id` is, per item_type (src/app/api/watchlist/logic.ts's ITEM_TYPES):
//       'reg' | 'signal' | 'research' | 'operations' -> intelligence_items.id
//       'source'                                      -> sources.id
//       'market_series'                                -> market_series.id
//   - `derived_values.entity_id` is an ENTITIES.ENTITY_ID (migration 282's spine, minted by
//     src/lib/entities/entity-id.mjs's entityId(kind, code) — e.g. a jurisdiction or corridor slug), never
//     an intelligence_items/sources/market_series primary key.
// No org_watchlist item_id has ever equaled an entities.entity_id (confirmed: migration 283 is the only
// place either FK exists, and it is additive/nullable, never a rewrite of the watched id itself), so the
// notices route always filtered derived_values by ids it could never actually carry — every notice was
// unreachable regardless of what a reader watched, not only because derived_values has 0 superseded pairs
// live today (it does — see route.ts's own comment on that), but structurally: even with real superseded
// pairs present, a watcher's entityIds array up to now could never intersect them.
//
// THE FIX. Resolve each watched item to the real entity id(s) it is ABOUT, via the two FK paths migration
// 283 actually built:
//   - an intelligence_item's `instrument_entity_id` (single-valued: the one canonical instrument it names)
//     PLUS `entity_refs` rows where `ref_table='intelligence_items' AND ref_id=<the item>` (multi-valued:
//     one row per jurisdiction on `jurisdiction_iso`, migration 283's own join table — see that
//     migration's header for why jurisdiction could not be a second scalar FK column).
//   - a source's `organisation_entity_id` (single-valued: the one organisation that owns it).
// `market_series` watches resolve to nothing: no entity FK exists on `market_series` as of migration 283
// (the entity spine's progressive re-keying reached intelligence_items and sources, not market_series) —
// this is a real, named limitation, not a silent drop: a market_series watch simply contributes zero
// entity ids to the notice feed today, the same honest "nothing to resolve" a caller gets for any watched
// item with no instrument/organisation/jurisdiction entity backfilled yet (entity_refs/instrument_entity_id
// are additive-progressive, per migration 283, so an item ahead of scripts/entities/backfill-entities.mjs's
// last run legitimately resolves to nothing rather than a fabricated guess).
//
// PLAIN, MINIMAL CLIENT INTERFACE — same posture as this directory's other DB-touching helpers
// (drain.ts's DrainClient, superseded-notices.ts's NoticesClient): a hand-rolled fake satisfies it with
// zero npm dependency, so resolveWatchedEntityIds is provable with `node --test` and no database.

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
    const itemsRes = await client.from("intelligence_items").select("id,instrument_entity_id").in("id", intelligenceItemIds);
    if (!itemsRes.error && Array.isArray(itemsRes.data)) {
      for (const row of itemsRes.data as Array<{ instrument_entity_id: string | null }>) {
        if (row.instrument_entity_id) entityIds.add(row.instrument_entity_id);
      }
    }

    const refsRes = await client.from("entity_refs").select("entity_id").eq("ref_table", "intelligence_items").in("ref_id", intelligenceItemIds);
    if (!refsRes.error && Array.isArray(refsRes.data)) {
      for (const row of refsRes.data as Array<{ entity_id: string }>) {
        if (row.entity_id) entityIds.add(row.entity_id);
      }
    }
  }

  if (sourceIds.length > 0) {
    const sourcesRes = await client.from("sources").select("id,organisation_entity_id").in("id", sourceIds);
    if (!sourcesRes.error && Array.isArray(sourcesRes.data)) {
      for (const row of sourcesRes.data as Array<{ organisation_entity_id: string | null }>) {
        if (row.organisation_entity_id) entityIds.add(row.organisation_entity_id);
      }
    }
  }

  return [...entityIds];
}
