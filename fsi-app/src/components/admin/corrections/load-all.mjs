// load-all.mjs , the Corrections tab's read (lane G7-UI, 2026-10-06). The G7-CORR API lists corrections per item
// only, so the tab reads the whole table through the existing platform-admin SELECT policy (migration 356, the
// readers' own readAllCorrections) and takes the one thing only the API computes, "orphaned", from the contract's
// own per-item list route, for just the items that hold an active fact correction. The client and the fetcher are
// injected; nothing here constructs either.
import { readAllCorrections, latestPerTarget } from "../../../lib/corrections/item-corrections.mjs";
import { fetchAllByIdChunks } from "../../../lib/db/paginate.mjs";
import { fetchItemCorrections } from "./model.mjs";

/** The per-item list route is rate limited (60 a minute); one call per item stays well inside it. */
export const MAX_ORPHAN_CHECKS = 40;

/**
 * @param {object} supabase a browser Supabase client (platform admin session)
 * @param {(url:string, init?:object)=>Promise<Response>} fetcher authedFetch in the app
 * @returns {Promise<{rows:Array<object>, unchecked:number}>} rows newest first; `unchecked` is how many items
 *   with an active fact correction were not asked about orphans (over the cap or the request failed)
 */
export async function loadAllCorrections(supabase, fetcher) {
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
  let unchecked = Math.max(0, factItems.length - MAX_ORPHAN_CHECKS);
  for (const itemId of factItems.slice(0, MAX_ORPHAN_CHECKS)) {
    const out = await fetchItemCorrections(fetcher, itemId);
    if (!out.ok) {
      unchecked += 1;
      continue;
    }
    for (const c of out.corrections) if (c.orphaned) orphaned.add(c.id);
  }

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
