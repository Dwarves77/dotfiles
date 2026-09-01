import { mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

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
//
// PRIOR-STATE SNAPSHOT (R1 retrofit, rule-015 reversibility). Before this retrofit, an upsert that
// REFRESHED an own-origin row (the "refreshed" count above) overwrote basis/score with no captured
// prior value anywhere — the exact gap rule 015 exists to close for scripted writes. This writer
// cannot adopt scripts/lib/db.mjs's guardedUpdate/guardedInsertMany directly: those functions
// construct their OWN write client from env vars, while this function deliberately RECEIVES its
// client (the file header's own "stays import-light and pure of secrets" contract) so mint-item.ts's
// server-request-scoped client and a script's long-lived client both work unmodified. Importing
// db.mjs here would also point src/ at scripts/ (the wrong dependency direction — scripts/ imports
// src/, never the reverse). So snapshot capture is OPT-IN via the `snapshot` option below: a caller
// that supplies `{ dir, cite }` gets a JSONL file written in db.mjs's EXACT byte format (one JSON
// line per prior row, `{_cite, table, prior}`, filename `${stamp}_item_cross_references.jsonl`,
// verified byte-for-byte against a fixture captured from db.mjs's own snapshot() output — see
// write-edges.test.mjs) BEFORE the refreshed rows are overwritten; a caller that omits it (mint-item.ts,
// today, unchanged) gets exactly the pre-retrofit behavior — no filesystem write on the serverless
// mint-time hot path. New INSERTs need no prior capture (nothing existed to lose); only REFRESHES
// (an own-origin row already present) are snapshotted, per R1's own "inserts need no prior capture"
// scope.

const pairKey = (s, t) => `${s}|${t}`;

// Mirrors scripts/lib/db.mjs's private snapshot() format exactly (that function is not exported, and
// src/ must not import scripts/ — the wrong dependency direction), so a snapshot written from either
// side is byte-for-byte interchangeable (verified in write-edges.test.mjs). node:fs/node:path are
// Node builtins — always available, zero install cost — so this is a plain static import, same as
// db.mjs's own top-of-file `import { mkdirSync, appendFileSync } from "node:fs"` (only the
// @supabase/supabase-js require is lazy there, for a different reason: an optional dependency that
// may not be installed). Do not change this shape without updating db.mjs's snapshot() in lockstep.
function writeSnapshotFile(dir, table, rows, cite, stampIso) {
  mkdirSync(dir, { recursive: true });
  const stamp = (stampIso || new Date().toISOString()).replace(/[:.]/g, "-");
  const file = resolve(dir, `${stamp}_${table}.jsonl`);
  for (const r of rows) appendFileSync(file, JSON.stringify({ _cite: cite, table, prior: r }) + "\n");
  return file;
}

/**
 * Upsert provenance-discovery edges, respecting origin ownership.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb - a write-capable client (caller-supplied).
 * @param {Array<{source_item_id:string,target_item_id:string,relationship:string,origin:string,basis:any,score:number}>} edges
 * @param {{chunk?:number, snapshot?:{dir:string, cite:{skill:string,reason:string}, stampIso?:string}}} [opts]
 *   `snapshot` (R1 retrofit, opt-in): when supplied, the prior row of every REFRESHED pair (an
 *   own-origin row about to be overwritten) is captured to `${snapshot.dir}/${stamp}_item_cross_references.jsonl`
 *   in db.mjs's exact snapshot format BEFORE the upsert runs. Omit for the pre-retrofit behavior
 *   (mint-item.ts's call site is unchanged: no filesystem write on the serverless mint-time path).
 * @returns {Promise<{inserted:number,refreshed:number,skippedForeignOrigin:number,written:number,failedChunks:number,snapshot:string|null}>}
 */
export async function writeDiscoveredEdges(sb, edges, { chunk = 200, snapshot } = {}) {
  const result = { inserted: 0, refreshed: 0, skippedForeignOrigin: 0, written: 0, failedChunks: 0, snapshot: null };
  if (!Array.isArray(edges) || edges.length === 0) return result;

  // Read the existing edges ONCE (small table; paginate defensively past the 1000-row cap). Full-row
  // select (not just origin) so a `snapshot` caller has the complete prior row to capture, at no extra
  // query cost for a caller that never opts in — the read already happens on every call.
  const owner = new Map(); // pairKey -> full existing row
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("item_cross_references")
      .select("*")
      .order("source_item_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`write-edges: existing-edge read failed: ${error.message}`);
    for (const r of data ?? []) owner.set(pairKey(r.source_item_id, r.target_item_id), r);
    if (!data || data.length < 1000) break;
  }

  // Partition: keep only pairs that are absent or already ours; skip foreign-origin pairs. Collect the
  // prior row of every REFRESH (an own-origin row about to be overwritten) — inserts have no prior row
  // to lose, per R1's "inserts need no prior capture" scope.
  const writable = [];
  const priorRefreshedRows = [];
  for (const e of edges) {
    const existing = owner.get(pairKey(e.source_item_id, e.target_item_id));
    const existingOrigin = existing?.origin;
    if (existingOrigin && existingOrigin !== "provenance_discovery") { result.skippedForeignOrigin++; continue; }
    if (existingOrigin === "provenance_discovery") { result.refreshed++; priorRefreshedRows.push(existing); }
    else result.inserted++;
    writable.push(e);
  }

  if (snapshot && priorRefreshedRows.length) {
    result.snapshot = writeSnapshotFile(snapshot.dir, "item_cross_references", priorRefreshedRows, snapshot.cite, snapshot.stampIso);
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
