#!/usr/bin/env node
// discover-for-items.mjs — closes the harness-to-flywheel leak: items minted via coordinator SQL
// bypass mint-item.ts's inline discovery hook (mint-item.ts's own writeDiscoveredEdges call, see
// src/lib/intake/mint-item.ts) and land with ZERO connection edges. This script runs the SAME
// discovery logic mint-time uses, on demand, for a specified set of EXISTING items — no forked
// scoring logic (reuses src/lib/connections/discover.mjs unmodified, exactly like backfill-edges.mjs
// does for the full-corpus pass) and writes edges through the SAME writer mint-time and the full
// backfill both use (src/lib/connections/write-edges.mjs), with the SAME origin value the discovery
// path already writes ('provenance_discovery' — write-edges.mjs's own file header names it "THE
// writer for origin='provenance_discovery' edges").
//
// WHY A SEPARATE SCRIPT, NOT A backfill-edges.mjs FLAG: backfill-edges.mjs scores every item against
// the WHOLE verified corpus (O(n) candidate loads per item) because it is a cold-start/repair pass
// over everything. This script scopes to a NAMED set of items (--ids or --since) precisely because
// the leak it closes is small and targeted (8 live items with zero edges, per the dispatch) — running
// the full corpus pass to fix 8 rows would be correct but wasteful. Both scripts share the same
// scoring (discover.mjs) and the same writer (write-edges.mjs); only the SELECTION of which items to
// (re)score differs.
//
// R1 retrofit applied at birth: write-edges.mjs's `snapshot` option is wired in from the start (this
// is a NEW script, not a retrofit target), so a refreshed row's prior state is captured the same way
// backfill-edges.mjs's own retrofit captures it.
//
// Usage:
//   node scripts/connections/discover-for-items.mjs --ids <uuid,uuid,...> [--dry|--execute]
//   node scripts/connections/discover-for-items.mjs --since <ISO-date-or-datetime> [--dry|--execute]
//   [--limit N] [--threshold T]
//     --ids      comma-separated intelligence_items.id list — score exactly these items
//     --since    intelligence_items.created_at >= this timestamp — score items inserted at/after it
//                (created_at, NOT added_date: created_at is the ROW-INSERT timestamp, the field a
//                coordinator-SQL mint that bypassed the hook actually shows up under; added_date is
//                an editorial date and can predate or postdate the insert)
//     --dry      compute + report, write nothing (DEFAULT)
//     --execute  actually write edges (explicit opt-in, mirrors the dispatch's --dry-default contract)
//     --limit N    max edges per item (default 12, matches backfill-edges.mjs's default)
//     --threshold  min connection score (default 0.3, matches backfill-edges.mjs's default)
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverConnections, computeTagFrequencies } from "../../src/lib/connections/discover.mjs";
import { writeDiscoveredEdges } from "../../src/lib/connections/write-edges.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";

// @supabase/supabase-js is imported LAZILY (inside main(), not at module top level) so this file stays
// importable WITHOUT node_modules installed — the same reason db.mjs lazy-requires it (see that file's
// top-of-file note): discover-for-items.test.mjs imports parseArgs/selectTargets from this module and
// must resolve cleanly in the no-npm-ci discipline test job. backfill-edges.mjs top-level-imports it
// because nothing imports backfill-edges.mjs as a module (it has no colocated test); this script does,
// so it cannot follow that same shortcut.

/**
 * Parse + validate CLI args. PURE (no process.env, no I/O) so it has a real colocated test
 * (discover-for-items.test.mjs) without needing to fake a DB or intercept process.exit.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ok:true, ids:string[]|null, since:string|null, execute:boolean, limit:number, threshold:number} | {ok:false, error:string}}
 */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const idsRaw = args[args.indexOf("--ids") + 1];
  const sinceRaw = args[args.indexOf("--since") + 1];
  const execute = args.includes("--execute");
  const limit = Number(args[args.indexOf("--limit") + 1]) || 12;
  const threshold = Number(args[args.indexOf("--threshold") + 1]) || 0.3;

  const ids = args.includes("--ids") && idsRaw && !idsRaw.startsWith("--")
    ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const since = args.includes("--since") && sinceRaw && !sinceRaw.startsWith("--") ? sinceRaw : null;

  if ((!ids || !ids.length) && !since) {
    return { ok: false, error: "one of --ids <uuid,...> or --since <ISO-date> is required." };
  }
  if (ids && since) {
    return { ok: false, error: "pass --ids OR --since, not both (ambiguous selection)." };
  }
  if (since && Number.isNaN(Date.parse(since))) {
    return { ok: false, error: `--since value is not a parseable date: ${JSON.stringify(since)}` };
  }
  return { ok: true, ids, since, execute, limit, threshold };
}

/**
 * Select target items from an already-loaded corpus, per --ids or --since. PURE.
 * @param {Array<{id:string, created_at?:string}>} corpus
 * @param {{ids:string[]|null, since:string|null}} selection - from parseArgs()
 * @returns {{targets:Array, missingIds:string[]}}
 */
export function selectTargets(corpus, { ids, since }) {
  const list = Array.isArray(corpus) ? corpus : [];
  if (ids) {
    const idSet = new Set(ids);
    const targets = list.filter((it) => idSet.has(it.id));
    const missingIds = ids.filter((id) => !targets.some((t) => t.id === id));
    return { targets, missingIds };
  }
  const sinceMs = Date.parse(since);
  const targets = list.filter((it) => it.created_at && Date.parse(it.created_at) >= sinceMs);
  return { targets, missingIds: [] };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`discover-for-items: ${parsed.error}`);
  process.exit(1);
}
const { ids, since, execute: EXECUTE, limit: LIMIT, threshold: THRESHOLD } = parsed;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("discover-for-items: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const SNAP_DIR = process.env.DISCIPLINE_SNAP_DIR ? resolve(process.env.DISCIPLINE_SNAP_DIR) : resolve(ROOT, "scripts", "_snapshots");
const CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "U0 discover-for-items: run mint-time discovery for items that bypassed the mint hook (coordinator-SQL mints), through the guarded write-edges.mjs path.",
};

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Same connection-signature column set backfill-edges.mjs / mint-item.ts select (one shared list
// would need a query-layer module — see mint-item.ts's own note on this exact duplication — this is
// the accepted seam until that refactor exists).
const SIG = "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags, created_at";

async function loadCorpus() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("intelligence_items").select(SIG)
      .eq("provenance_status", "verified").eq("is_archived", false)
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`corpus read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const corpus = await loadCorpus();

const { targets, missingIds } = selectTargets(corpus, { ids, since });
if (missingIds.length) {
  console.warn(`discover-for-items: ${missingIds.length} requested id(s) not found in the verified/live corpus (ignored): ${missingIds.join(", ")}`);
}

console.log(
  `discover-for-items: ${corpus.length} verified items loaded (candidate pool); ${targets.length} target item(s) selected` +
  `${EXECUTE ? "" : " (DRY RUN)"} (threshold ${THRESHOLD}, limit ${LIMIT}/item).`
);

if (!targets.length) {
  console.log("No target items matched the selection — nothing to do.");
  process.exit(0);
}

// ADR-019 freqMap over the SAME candidate corpus a target is scored against (mirrors backfill-edges.mjs
// and mint-item.ts — no new query, same corpus already loaded).
const freqMap = computeTagFrequencies(corpus);
const opts = { threshold: THRESHOLD, limit: LIMIT, surfaceOf: (t) => surfaceOf(t), freqMap };

let edgesTotal = 0, crossSurfaceTotal = 0, itemsWithEdges = 0;
const allEdges = [];
for (const item of targets) {
  // Candidates = the whole corpus MINUS the item itself (discoverConnections already guards
  // self-pairs, but excluding here keeps the candidate set the same shape mint-item.ts scores
  // against: every OTHER verified item, never itself).
  const conns = discoverConnections(item, corpus, opts);
  if (!conns.length) continue;
  itemsWithEdges++;
  crossSurfaceTotal += conns.filter((c) => c.crossSurface).length;
  edgesTotal += conns.length;
  for (const c of conns) {
    allEdges.push({
      source_item_id: item.id, target_item_id: c.target,
      relationship: "related", origin: "provenance_discovery",
      basis: c.basis, score: c.score,
    });
  }
}

console.log(`DISCOVERED: ${edgesTotal} edges across ${itemsWithEdges}/${targets.length} target item(s); ${crossSurfaceTotal} cross-surface.`);

if (!EXECUTE) {
  console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
  process.exit(0);
}

const w = await writeDiscoveredEdges(sb, allEdges, { snapshot: { dir: SNAP_DIR, cite: CITE } });
console.log(
  `WROTE: ${w.written} edge rows (${w.inserted} new, ${w.refreshed} refreshed); ` +
  `${w.skippedForeignOrigin} skipped (owned by entity/semantic origin); ${w.failedChunks} chunk failure(s).`
);
if (w.snapshot) console.log(`SNAPSHOT: prior state of ${w.refreshed} refreshed row(s) captured to ${w.snapshot}`);
process.exit(0);
}
