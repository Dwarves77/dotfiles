import { guardedInsert, guardedUpdate } from "./db.mjs";

/**
 * Read the current item_gate_a_state row for one item, or null if none exists.
 * `rc` is a read-only supabase-like client (readClient() from db.mjs), same as provenance-heal.mjs's own
 * `rc` parameter. Selects gate_a_version/orphan_count in addition to the id column the pre-extraction
 * version selected, so a re-scan caller can compare against GATE_A_VERSION without a second read.
 */
export async function readGateAStateRow(rc, itemId) {
  const { data, error } = await rc
    .from("item_gate_a_state")
    .select("intelligence_item_id, gate_a_version, orphan_count, scanned_hash")
    .eq("intelligence_item_id", itemId)
    .maybeSingle();
  if (error) throw new Error(`gate-a-state-writer: readGateAStateRow failed: ${error.message}`);
  return data ?? null;
}

/**
 * Update-or-insert one item_gate_a_state row. `row` is the exact shape write-item.ts's buildGateARow
 * produces (intelligence_item_id, scanned_hash, orphan_count, orphans, gate_a_version, scanned_at).
 * `exists` is supplied by the caller (from its own prior readGateAStateRow call) rather than re-derived
 * here, matching the pre-extraction inline behaviour exactly.
 */
export async function upsertGateAState(row, exists, { cite } = {}) {
  return exists
    ? guardedUpdate("item_gate_a_state", (q) => q.eq("intelligence_item_id", row.intelligence_item_id), row, { cite })
    : guardedInsert("item_gate_a_state", row, { cite, select: "intelligence_item_id" });
}
