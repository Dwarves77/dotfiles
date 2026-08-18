// write-edges.mjs — the SINGLE write home for provenance-discovery connection edges (Pillar A2).
//
// Reuse-before-construction: edges into item_cross_references are written from the typed src/ layer
// everywhere else — mint-item.ts (mint-time), link-items.ts (entity linker), canonical-pipeline.ts
// (agent_semantic). This is the matching writer for origin='provenance_discovery' edges. It lives in
// src/ (not in the one-off backfill script) so the upsert logic has ONE home: the corpus backfill calls
// it today, and a scan-time incremental hook can call the same function later — no copied write path.
// It RECEIVES the Supabase client (never constructs one) so it stays import-light and pure of secrets,
// mirroring discover.mjs. MOAT BOUNDARY: writes ONLY item_cross_references — never claims/provenance.
//
// ORIGIN OWNERSHIP (correctness, not just idempotency): item_cross_references is unique on
// (source_item_id, target_item_id) — ONE row per ordered pair, shared across all four origins. This
// writer OWNS 'provenance_discovery' and MUST NOT clobber a row another origin created: an
// entity_extraction 'references' edge and an agent_semantic edge each carry a more specific
// relationship than a discovery 'related' edge, and a blind upsert (the original backfill's bug) would
// overwrite them. So it reads the existing edges once, then upserts ONLY pairs that are ABSENT or
// already provenance_discovery; foreign-origin pairs are skipped and counted. On our own pairs the
// upsert refreshes basis/score (re-runs never duplicate, never divergent). Non-gating: a failed chunk
// is counted and returned for the caller to log, never thrown — a wrong edge never blocks a brief or a
// customer read.
//
// Directionality (ADR-018, decided with the U3 detect_intersections supersession): discover.mjs signals
// are symmetric, and the backfill loops every item, so both (A,B) and (B,A) get produced. This writer
// keeps both directions AT REST — the readers of the graph that filter source-only REQUIRE both, so
// canonicalizing to source<target here would hide edges. Readers that need undirected pairs
// canonicalize at read time via pair-view.mjs (collapsePairs), never by a second storage shape or a
// second SQL collapse home.

const pairKey = (s, t) => `${s}|${t}`;

/**
 * Upsert provenance-discovery edges, respecting origin ownership.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb - a write-capable client (caller-supplied).
 * @param {Array<{source_item_id:string,target_item_id:string,relationship:string,origin:string,basis:any,score:number}>} edges
 * @param {{chunk?:number}} [opts]
 * @returns {Promise<{inserted:number,refreshed:number,skippedForeignOrigin:number,written:number,failedChunks:number}>}
 */
export async function writeDiscoveredEdges(sb, edges, { chunk = 200 } = {}) {
  const result = { inserted: 0, refreshed: 0, skippedForeignOrigin: 0, written: 0, failedChunks: 0 };
  if (!Array.isArray(edges) || edges.length === 0) return result;

  // Read the existing edges' origins ONCE (small table; paginate defensively past the 1000-row cap).
  const owner = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("item_cross_references")
      .select("source_item_id, target_item_id, origin")
      .order("source_item_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`write-edges: existing-edge read failed: ${error.message}`);
    for (const r of data ?? []) owner.set(pairKey(r.source_item_id, r.target_item_id), r.origin);
    if (!data || data.length < 1000) break;
  }

  // Partition: keep only pairs that are absent or already ours; skip foreign-origin pairs.
  const writable = [];
  for (const e of edges) {
    const existingOrigin = owner.get(pairKey(e.source_item_id, e.target_item_id));
    if (existingOrigin && existingOrigin !== "provenance_discovery") { result.skippedForeignOrigin++; continue; }
    if (existingOrigin === "provenance_discovery") result.refreshed++; else result.inserted++;
    writable.push(e);
  }

  for (let i = 0; i < writable.length; i += chunk) {
    const batch = writable.slice(i, i + chunk);
    const { error } = await sb
      .from("item_cross_references")
      .upsert(batch, { onConflict: "source_item_id,target_item_id" });
    if (error) { result.failedChunks++; console.warn(`[write-edges] chunk ${i} failed: ${error.message}`); }
    else result.written += batch.length;
  }
  return result;
}
