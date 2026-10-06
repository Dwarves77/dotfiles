// SHARED-WRITER: item_cross_references
import { mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { isIntersectionEntry, buildIntersectionEntry } from "./intersections.mjs";
// lane G7-CORR: admin connection tombstones (item_corrections, migration 356). The database trigger drops a
// tombstoned machine edge; this writer reads the same tombstones so it plans around them and reports them.
import { readAllCorrections, tombstonedPairKeys, isPairTombstoned } from "../corrections/item-corrections.mjs";

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

// mirror of scripts/lib/db.mjs's snapshot(): kept, that function is private (not exported).
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

// Read every existing edge row once (paginated past the 1000-row cap). Shared by both writers below.
async function readExistingEdges(sb) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("item_cross_references")
      .select("*")
      .order("source_item_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`write-edges: existing-edge read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
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
 * @returns {Promise<{inserted:number,refreshed:number,skippedForeignOrigin:number,skippedTombstoned:number,written:number,failedChunks:number,snapshot:string|null}>}
 */
export async function writeDiscoveredEdges(sb, edges, { chunk = 200, snapshot } = {}) {
  const result = { inserted: 0, refreshed: 0, skippedForeignOrigin: 0, skippedTombstoned: 0, written: 0, failedChunks: 0, snapshot: null };
  if (!Array.isArray(edges) || edges.length === 0) return result;

  // Admin tombstones (a removed connection is never re-created by a machine pass). A read failure throws.
  const tombstones = tombstonedPairKeys(await readAllCorrections(sb));

  // Read the existing edges ONCE (small table; paginate defensively past the 1000-row cap). Full-row
  // select (not just origin) so a `snapshot` caller has the complete prior row to capture, at no extra
  // query cost for a caller that never opts in — the read already happens on every call.
  const owner = new Map(); // pairKey -> full existing row
  for (const r of await readExistingEdges(sb)) owner.set(pairKey(r.source_item_id, r.target_item_id), r);

  // Partition: keep only pairs that are absent or already ours; skip foreign-origin pairs. Collect the
  // prior row of every REFRESH (an own-origin row about to be overwritten) — inserts have no prior row
  // to lose, per R1's "inserts need no prior capture" scope.
  const writable = [];
  const priorRefreshedRows = [];
  for (const e of edges) {
    if (isPairTombstoned(tombstones, e.source_item_id, e.target_item_id)) { result.skippedTombstoned++; continue; }
    const existing = owner.get(pairKey(e.source_item_id, e.target_item_id));
    const existingOrigin = existing?.origin;
    if (existingOrigin && existingOrigin !== "provenance_discovery") { result.skippedForeignOrigin++; continue; }
    if (existingOrigin === "provenance_discovery") {
      result.refreshed++;
      priorRefreshedRows.push(existing);
      // The intersection basis entry belongs to the intersection pass (writeIntersectionEdges below), not
      // to discovery: a discovery refresh replaces basis/score wholesale, so carry the entry forward rather
      // than erase another pass's evidence. Only that pass removes it.
      const carried = (Array.isArray(existing.basis) ? existing.basis : []).filter(isIntersectionEntry);
      const incoming = Array.isArray(e.basis) ? e.basis : [];
      if (carried.length && !incoming.some(isIntersectionEntry)) {
        writable.push({ ...e, basis: [...incoming, ...carried] });
        continue;
      }
    } else result.inserted++;
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

// ── lane S3-A: the intersection basis entry ─────────────────────────────────────────────────────────
//
// An intersection (intersections.mjs) is NOT a second graph: it is one more basis entry on the pair's
// existing item_cross_references row, written here so the table keeps ONE writer module. Rules:
//   * both directed rows (ADR-018). A pair with no row gets one, relationship 'related', origin
//     'provenance_discovery', score = strengthToScore(strength) via the entry's weight.
//   * a MANUAL-origin row is never changed (admin override is respected, an automatic writer never
//     overwrites it); skipped and counted.
//   * any other existing row (provenance_discovery, entity_extraction, agent_semantic) is ADDITIVE per
//     ADR-022 clause 2: relationship, origin and score are kept, the intersection entry is appended to (or
//     replaced within) basis, nothing else changes.
//   * an intersection that no longer holds has ONLY its intersection entry removed. DECISION recorded in the
//     lane report: when that leaves a provenance_discovery row with no basis at all (the row existed only
//     because of the intersection), the row is deleted, because discover.mjs's grounding guarantee forbids
//     an edge with no basis and a ghost edge would keep clustering. The prior row is snapshotted first.

const stableJson = (x) => JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const canonKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * PURE. Plan the intersection writes against the existing edge rows.
 * @param {Array<object>} existingRows full item_cross_references rows (id, source_item_id, target_item_id, relationship, origin, basis, score)
 * @param {Array<{a:string,b:string,shared_scenarios:string[],shared_objects:string[],strength:number,tier:string}>} pairs from detectIntersections
 * @param {Set<string>} [tombstones] canonical pair keys an admin removed (tombstonedPairKeys); those pairs are skipped
 */
export function planIntersectionEdges(existingRows, pairs, tombstones) {
  const byKey = new Map();
  for (const r of Array.isArray(existingRows) ? existingRows : []) byKey.set(pairKey(r.source_item_id, r.target_item_id), r);
  const plan = { inserts: [], updates: [], removals: [], deletes: [], unchanged: 0, skippedManual: 0, skippedTombstoned: 0 };
  const holding = new Set();

  for (const p of Array.isArray(pairs) ? pairs : []) {
    holding.add(canonKey(p.a, p.b));
    const entry = buildIntersectionEntry(p);
    for (const [s, t] of [[p.a, p.b], [p.b, p.a]]) {
      if (isPairTombstoned(tombstones, s, t)) { plan.skippedTombstoned++; continue; }
      const row = byKey.get(pairKey(s, t));
      if (!row) {
        plan.inserts.push({ source_item_id: s, target_item_id: t, relationship: "related", origin: "provenance_discovery", basis: [entry], score: entry.weight });
        continue;
      }
      if (row.origin === "manual") { plan.skippedManual++; continue; }
      const basis = Array.isArray(row.basis) ? row.basis : [];
      const prior = basis.find(isIntersectionEntry);
      if (prior && stableJson(prior) === stableJson(entry)) { plan.unchanged++; continue; }
      plan.updates.push({ row, basis: [...basis.filter((b) => !isIntersectionEntry(b)), entry] });
    }
  }

  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    const basis = Array.isArray(row.basis) ? row.basis : [];
    if (!basis.some(isIntersectionEntry)) continue;
    if (holding.has(canonKey(row.source_item_id, row.target_item_id))) continue;
    if (row.origin === "manual") { plan.skippedManual++; continue; }
    const rest = basis.filter((b) => !isIntersectionEntry(b));
    if (!rest.length && row.origin === "provenance_discovery") plan.deletes.push(row);
    else plan.removals.push({ row, basis: rest });
  }
  return plan;
}

/** PURE. The edge rows as they stand after the plan (dry-mode preview for the clustering pass). */
export function projectEdgeRows(existingRows, plan) {
  const drop = new Set(plan.deletes.map((r) => pairKey(r.source_item_id, r.target_item_id)));
  const patched = new Map();
  for (const u of [...plan.updates, ...plan.removals]) patched.set(pairKey(u.row.source_item_id, u.row.target_item_id), u.basis);
  const out = [];
  for (const r of Array.isArray(existingRows) ? existingRows : []) {
    const k = pairKey(r.source_item_id, r.target_item_id);
    if (drop.has(k)) continue;
    out.push(patched.has(k) ? { ...r, basis: patched.get(k) } : r);
  }
  return [...out, ...plan.inserts.map((r) => ({ ...r }))];
}

/**
 * Write the intersection basis entries. Dry by option: with { dry: true } nothing is written, no client is
 * needed when `existing` is supplied, and the result carries the plan counts plus `projected` rows.
 * @param {import('@supabase/supabase-js').SupabaseClient|null} sb
 * @param {Array} pairs from detectIntersections
 * @param {{chunk?:number, dry?:boolean, existing?:Array<object>, snapshot?:{dir:string, cite:{skill:string,reason:string}, stampIso?:string}}} [opts]
 * @returns {Promise<{inserted:number,updated:number,removed:number,deleted:number,unchanged:number,skippedManual:number,skippedTombstoned:number,written:number,failedChunks:number,snapshot:string|null,projected:Array<object>|null}>}
 */
export async function writeIntersectionEdges(sb, pairs, { chunk = 200, dry = false, existing, snapshot } = {}) {
  const rows = Array.isArray(existing) ? existing : await readExistingEdges(sb);
  // With no client (the dry preview over a supplied `existing`) there is nothing to read: no tombstones.
  const tombstones = sb ? tombstonedPairKeys(await readAllCorrections(sb)) : undefined;
  const plan = planIntersectionEdges(rows, pairs, tombstones);
  const result = {
    inserted: plan.inserts.length, updated: plan.updates.length, removed: plan.removals.length, deleted: plan.deletes.length,
    unchanged: plan.unchanged, skippedManual: plan.skippedManual, skippedTombstoned: plan.skippedTombstoned, written: 0, failedChunks: 0, snapshot: null, projected: null,
  };
  if (dry) { result.projected = projectEdgeRows(rows, plan); return result; }

  const priors = [...plan.updates.map((u) => u.row), ...plan.removals.map((u) => u.row), ...plan.deletes];
  if (snapshot && priors.length) {
    result.snapshot = writeSnapshotFile(snapshot.dir, "item_cross_references", priors, snapshot.cite, snapshot.stampIso);
  }

  // Updates carry the row's own relationship/origin/score back unchanged (a NOT NULL column must be present
  // on the proposed tuple of an upsert); only basis differs.
  const upserts = [
    ...plan.inserts,
    ...[...plan.updates, ...plan.removals].map(({ row, basis }) => ({
      source_item_id: row.source_item_id, target_item_id: row.target_item_id,
      relationship: row.relationship, origin: row.origin, score: row.score ?? null, basis,
    })),
  ];
  for (let i = 0; i < upserts.length; i += chunk) {
    const batch = upserts.slice(i, i + chunk);
    const { error } = await sb.from("item_cross_references").upsert(batch, { onConflict: "source_item_id,target_item_id" });
    if (error) { result.failedChunks++; console.warn(`[write-edges] intersection chunk ${i} failed: ${error.message}`); }
    else result.written += batch.length;
  }
  const delIds = plan.deletes.map((r) => r.id).filter(Boolean);
  for (let i = 0; i < delIds.length; i += 100) {
    const ids = delIds.slice(i, i + 100);
    // fitness-allow: F39 (ids is a 100-element slice of delIds, bounded per request)
    const { error } = await sb.from("item_cross_references").delete().in("id", ids);
    if (error) { result.failedChunks++; console.warn(`[write-edges] intersection delete chunk ${i} failed: ${error.message}`); }
    else result.written += ids.length;
  }
  return result;
}
