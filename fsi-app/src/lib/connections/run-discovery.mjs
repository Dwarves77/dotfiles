// run-discovery.mjs — the shared connection-discovery-and-write driver (Pillar A1 discover.mjs + Pillar
// A2 write-edges.mjs glue), reused by every rule-16(a) participant: mint-item.ts at mint time, and
// apply-staged-update.ts at substantive-update time (contract rule 16, "the forward-participation
// clause"). Loads the non-archived, verified corpus signature (CONNECTION_SIGNATURE_COLUMNS — the SAME
// set backfill-edges.mjs (Pillar A2, scripts/) selects; duplicating the column-list STRING across the
// src/scripts boundary remains the accepted seam mint-item.ts's own prior header documented — but within
// src/, this module is now the one home for the query, closing the query-layer-refactor gap that header
// named), scores the given item's own signature against it (discover.mjs, pure), and writes any material
// connections through write-edges.mjs's origin-aware upsert (never clobbers an entity_extraction /
// agent_semantic edge).
//
// MOVED HERE (lane FIX, 2026-09-01) from mint-item.ts's own post-insert block, unify the corpus-load +
// score + write sequence in ONE place before apply-staged-update.ts grew a second hand-copied copy of it
// for the update path. Content and behavior for the mint caller are UNCHANGED by this move — same query
// shape (select/eq/eq/neq/order/range), same threshold/limit defaults, same edge shape — verified by
// mint-forward-participation.npmtest.mjs, which exercises this exact call sequence unmodified.
//
// Throws on a corpus read error so BOTH callers' identical try/catch + recordFlywheelDefect (rule 16d)
// posture keeps working unchanged: this function never swallows an error itself, that is the caller's job.
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
