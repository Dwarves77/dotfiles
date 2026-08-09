#!/usr/bin/env node
// backfill-edges.mjs — PILLAR A2. Populate item_cross_references from SHARED PROVENANCE, model-independent, $0.
//
// Runs the pure connection-discovery engine (src/lib/connections/discover.mjs — the single logic home) over
// the verified corpus and writes grounded edges: origin='provenance_discovery', relationship='related', and
// basis=the real shared attributes (mig 252). This is source-growth applied to connections — it turns the
// dormant 3% / 61-edge graph into real coverage without spending anything or touching generation.
//
// MOAT BOUNDARY: writes ONLY item_cross_references (never claims/provenance). Idempotent: upsert on
// (source_item_id, target_item_id) refreshes basis/score; re-runs never duplicate. Non-gating.
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
const opts = { threshold: THRESHOLD, limit: LIMIT, surfaceOf: (t) => surfaceOf(t) };

for (const item of corpus) {
  const conns = discoverConnections(item, corpus, opts);
  if (!conns.length) continue;
  itemsWithEdges++;
  crossSurfaceTotal += conns.filter((c) => c.crossSurface).length;
  edgesTotal += conns.length;
  if (DRY) continue;
  const edges = conns.map((c) => ({
    source_item_id: item.id, target_item_id: c.target,
    relationship: "related", origin: "provenance_discovery",
    basis: c.basis, score: c.score,
  }));
  // upsert in chunks; a failure on one item is logged, never fatal (non-gating).
  for (let i = 0; i < edges.length; i += 200) {
    const { error } = await sb.from("item_cross_references")
      .upsert(edges.slice(i, i + 200), { onConflict: "source_item_id,target_item_id" });
    if (error) console.warn(`[backfill] upsert failed for ${item.id.slice(0, 8)}: ${error.message}`);
  }
}

console.log(`\n${DRY ? "WOULD WRITE" : "WROTE"}: ${edgesTotal} edges across ${itemsWithEdges}/${corpus.length} items; ${crossSurfaceTotal} cross-surface.`);
console.log(DRY ? "DRY RUN — nothing written. Re-run without --dry to apply." : "Backfill complete. item_cross_references now carries provenance-grounded edges with basis.");
process.exit(0);
