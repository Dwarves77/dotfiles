// load-all.mjs , the Corrections tab's read (lane G7-UI, 2026-10-06; orphan check batched in lane DFIX-2). The
// G7-CORR API lists corrections per item only, so the tab reads the whole table through the existing platform-admin
// SELECT policy (migration 356, the readers' own readAllCorrections). "Orphaned" is the one thing the per-item API
// computes (findOrphanedFactCorrections over the item's current claims); the tab computes it with the SAME function
// over ONE batched read of the claims of every item that holds an active fact correction (chunked id lists, each
// chunk paged to the end), instead of one API request per item (which hit the route's rate limit and needed a cap).
// The client is injected; nothing here constructs one.
import { readAllCorrections, latestPerTarget, findOrphanedFactCorrections } from "../../../lib/corrections/item-corrections.mjs";
import { fetchAllByIdChunks, fetchAllRows } from "../../../lib/db/paginate.mjs";

/** Items per claims read; one chunk is one `in` list, paged until a short page. */
const CLAIM_CHUNK = 50;

/**
 * @param {object} supabase a browser Supabase client (platform admin session)
 * @returns {Promise<{rows:Array<object>, unchecked:number}>} rows newest first; `unchecked` is how many items
 *   with an active fact correction could not be asked about orphans (their claims read failed), 0 normally
 */
export async function loadAllCorrections(supabase) {
  const raw = await readAllCorrections(supabase);
  const latestIds = new Set([...latestPerTarget(raw).values()].map((r) => r.id));

  const titles = new Map();
  const itemIds = [...new Set(raw.map((r) => r.item_id))];
  const items = await fetchAllByIdChunks(itemIds, async (slice) => {
    const { data, error } = await supabase.from("intelligence_items").select("id, title").in("id", slice);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  for (const i of items) titles.set(i.id, i.title);

  const factItems = [...new Set(raw.filter((r) => r.target_kind === "fact" && !r.revoked_at).map((r) => r.item_id))];
  const orphaned = new Set();
  const unreadable = new Set(); // items whose claims could not be read: counted and shown, never guessed orphaned
  const claims = await fetchAllByIdChunks(
    factItems,
    async (slice) => {
      try {
        return await fetchAllRows((from, to) =>
          supabase.from("section_claim_provenance").select("id, claim_text, intelligence_item_id").in("intelligence_item_id", slice).order("id").range(from, to),
        );
      } catch {
        for (const id of slice) unreadable.add(id);
        return [];
      }
    },
    { chunk: CLAIM_CHUNK, manyPerId: true },
  );
  for (const itemId of factItems) {
    if (unreadable.has(itemId)) continue;
    const itemClaims = claims.filter((c) => c.intelligence_item_id === itemId);
    const itemRows = raw.filter((r) => r.item_id === itemId);
    for (const c of findOrphanedFactCorrections(itemRows, itemClaims)) orphaned.add(c.id);
  }
  const unchecked = unreadable.size;

  const rows = raw
    .map((r) => ({
      ...r,
      active: !r.revoked_at,
      superseded: !r.revoked_at && !latestIds.has(r.id),
      orphaned: orphaned.has(r.id),
      item_title: titles.get(r.item_id) ?? null,
    }))
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return { rows, unchecked };
}
