#!/usr/bin/env node
// backfill-edges.mjs — PILLAR A2. Populate item_cross_references from SHARED PROVENANCE, model-independent, $0.
//
// Runs the pure connection-discovery engine (src/lib/connections/discover.mjs — the single scoring home)
// over the verified corpus and hands the grounded edges to the single edge-writer
// (src/lib/connections/write-edges.mjs) which upserts origin='provenance_discovery',
// relationship='related', basis=the real shared attributes, score (mig 252). This is source-growth
// applied to connections — it turns the dormant 3% / 61-edge graph into real coverage without spending
// anything or touching generation.
//
// WHY THE WRITE LIVES IN src/, NOT HERE: item_cross_references is written from the typed src/ layer
// everywhere else (mint-item, link-items, canonical-pipeline). This script is a thin ORCHESTRATOR —
// load corpus → discover → delegate the write — so the upsert has one home reusable by a future
// scan-time hook, and this file performs no raw row mutation (rule 015: the guarded-path requirement for
// scripts is satisfied by the write genuinely living in the src/ layer, not by a bypass trailer).
//
// MOAT BOUNDARY: the delegated writer touches ONLY item_cross_references (never claims/provenance).
// Idempotent + origin-aware: re-runs refresh basis/score on our own edges and never clobber an
// entity_extraction / agent_semantic edge (see write-edges.mjs). Non-gating.
//
// Usage: node scripts/connections/backfill-edges.mjs [--dry] [--limit N] [--threshold T]
//   --dry        compute + report, write nothing (default is to write)
//   --limit N    max edges per item (default 12)
//   --threshold  min connection score (default 0.3)
// Exit 0 done · 2 no DB creds (cannot run here; runs in the secrets lane / via the operator's machine).

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverConnections } from "../../src/lib/connections/discover.mjs";
import { writeDiscoveredEdges } from "../../src/lib/connections/write-edges.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("backfill-edges: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 12;
const THRESHOLD = Number(args[args.indexOf("--threshold") + 1]) || 0.3;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Load every verified, non-archived item's connection signature (paginated — the corpus exceeds 1000).
const SIG = "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";
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
console.log(`backfill-edges: ${corpus.length} verified items loaded${DRY ? " (DRY RUN)" : ""} (threshold ${THRESHOLD}, limit ${LIMIT}/item)`);

let edgesTotal = 0, crossSurfaceTotal = 0, itemsWithEdges = 0;
const allEdges = [];
const opts = { threshold: THRESHOLD, limit: LIMIT, surfaceOf: (t) => surfaceOf(t) };

for (const item of corpus) {
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

console.log(`\nDISCOVERED: ${edgesTotal} edges across ${itemsWithEdges}/${corpus.length} items; ${crossSurfaceTotal} cross-surface.`);

if (DRY) {
  console.log("DRY RUN — nothing written. Re-run without --dry to apply.");
  process.exit(0);
}

// Delegate the write to the single src/ edge-writer (origin-aware, idempotent, chunked).
const w = await writeDiscoveredEdges(sb, allEdges);
console.log(
  `WROTE: ${w.written} edge rows (${w.inserted} new, ${w.refreshed} refreshed); ` +
  `${w.skippedForeignOrigin} skipped (owned by entity/semantic origin); ${w.failedChunks} chunk failure(s).`
);
console.log("Backfill complete. item_cross_references now carries provenance-grounded edges with basis.");
process.exit(0);
