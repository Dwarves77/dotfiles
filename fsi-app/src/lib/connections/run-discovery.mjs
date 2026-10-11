import { discoverConnections, computeTagFrequencies } from "./discover.mjs";
import { writeDiscoveredEdges } from "./write-edges.mjs";
import { surfaceOf } from "../surface-of.mjs";

export const CONNECTION_SIGNATURE_COLUMNS =
  "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";

/**
 * Run L1 incremental connection discovery for one item's signature against the live corpus, and write
 * any material connections found. Bounded to 12 edges (discoverConnections' default limit).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} itemId - excluded from its own candidate corpus (a fresh mint's id, or an
 *   already-existing item being re-scanned after a substantive update — either way, "the rest of the
 *   corpus" never includes the item itself).
 * @param {Record<string, unknown>} signature - this item's own provenance signature: id plus the
 *   CONNECTION_SIGNATURE_COLUMNS fields (item_type, canonical_instrument_key, source_id,
 *   operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags), built
 *   by the caller from whatever source it has (a fresh mint seed, or a re-read of the item's current row
 *   after an update — the two callers' signatures are shaped identically either way).
 * @returns {Promise<number>} number of edges written (0 when no connection scored above threshold)
 */
export async function runConnectionDiscovery(sb, itemId, signature) {
  const corpus = [];
  for (let from = 0; ; from += 1000) {
    const { data: sigRows, error: sigErr } = await sb
      .from("intelligence_items")
      .select(CONNECTION_SIGNATURE_COLUMNS)
      .eq("provenance_status", "verified")
      .eq("is_archived", false)
      .neq("id", itemId)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (sigErr) throw new Error(sigErr.message);
    corpus.push(...(sigRows ?? []));
    if (!sigRows || sigRows.length < 1000) break;
  }
  // ADR-019: frequency map from this same already-loaded corpus — no new query, same discipline as
  // backfill-edges.mjs (the two callers must never diverge on what "shared provenance" weighs).
  const freqMap = computeTagFrequencies(corpus);
  const conns = discoverConnections(signature, corpus, { surfaceOf: (t) => surfaceOf(t), freqMap });
  if (!conns.length) return 0;
  const edges = conns.map((c) => ({
    source_item_id: itemId,
    target_item_id: c.target,
    relationship: "related",
    origin: "provenance_discovery",
    basis: c.basis,
    score: c.score,
  }));
  await writeDiscoveredEdges(sb, edges);
  return edges.length;
}
