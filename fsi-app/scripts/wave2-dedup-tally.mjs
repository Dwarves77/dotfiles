/** WAVE 2 dedup STEP 1c — final operator-facing tally ($0, READ-ONLY).
 *  CLEARED (delete) = rows sharing the FULL identity tuple (item, section_row_id, claim_text, source_id,
 *  source_tier_at_grounding, claim_kind, source_span) — byte-identical except id/extracted_at. Keep earliest.
 *  HELD classes (delete nothing), split by why the claim_text group is NOT fully identical:
 *    - MULTISECTION: same claim_text across >1 section_row_id (legitimate; control-proven pre-existing).
 *    - SPAN_DIVERGENT: same section_row_id, differing source_span (ambiguous; review).
 *    - OTHER_DIVERGENT: same section, differing source_id/tier/kind (review).
 *  Usage: node scripts/wave2-dedup-tally.mjs
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const FULL = ["section_row_id", "source_id", "source_tier_at_grounding", "claim_kind", "source_span"];

async function affectedItems() {
  const { data: markers } = await sb.from("agent_runs").select("intelligence_item_id").eq("fetch_method", "priced-line").not("intelligence_item_id", "is", null);
  const ids = new Set((markers || []).map((m) => m.intelligence_item_id));
  const seen = new Map(); let from = 0; const page = 1000;
  for (;;) {
    const { data } = await sb.from("section_claim_provenance").select("intelligence_item_id, claim_text").range(from, from + page - 1);
    if (!data || !data.length) break;
    for (const r of data) { const m = seen.get(r.intelligence_item_id) || new Map(); m.set(r.claim_text ?? "", (m.get(r.claim_text ?? "") || 0) + 1); seen.set(r.intelligence_item_id, m); }
    if (data.length < page) break; from += page;
  }
  for (const [id, m] of seen) for (const [, n] of m) if (n > 1) { ids.add(id); break; }
  return [...ids].filter(Boolean);
}

async function main() {
  const items = await affectedItems();
  let clearedGroups = 0, clearedDeletes = 0, multiSec = 0, spanDiv = 0, otherDiv = 0, itemsToDedup = 0;
  const perItem = [];
  for (const id of items) {
    const { data: claims } = await sb.from("section_claim_provenance")
      .select(["id", "claim_text", ...FULL].join(",")).eq("intelligence_item_id", id);
    const { data: it } = await sb.from("intelligence_items").select("title, provenance_status").eq("id", id).single();
    // full-identity groups -> cleared deletes
    const fullGroups = new Map();
    for (const c of claims || []) { const k = JSON.stringify([c.claim_text, ...FULL.map((f) => c[f] ?? null)]); (fullGroups.get(k) || fullGroups.set(k, []).get(k)).push(c); }
    let itemDeletes = 0, itemClearedGroups = 0;
    for (const [, rows] of fullGroups) if (rows.length > 1) { itemClearedGroups += 1; itemDeletes += rows.length - 1; }
    // claim_text groups -> held-class breakdown (only groups that are NOT fully identical)
    const ctGroups = new Map();
    for (const c of claims || []) { const k = c.claim_text ?? ""; (ctGroups.get(k) || ctGroups.set(k, []).get(k)).push(c); }
    for (const [, rows] of ctGroups) {
      if (rows.length <= 1) continue;
      const secs = new Set(rows.map((r) => r.section_row_id ?? null));
      // is this group fully covered by cleared full-identity deletes? if every row shares full identity, skip (counted above)
      const fullKeys = new Set(rows.map((r) => JSON.stringify([r.claim_text, ...FULL.map((f) => r[f] ?? null)])));
      if (fullKeys.size === 1) continue; // fully identical -> already cleared
      if (secs.size > 1) multiSec += 1;
      else { const spans = new Set(rows.map((r) => r.source_span ?? null)); if (spans.size > 1) spanDiv += 1; else otherDiv += 1; }
    }
    clearedGroups += itemClearedGroups; clearedDeletes += itemDeletes;
    if (itemDeletes > 0) { itemsToDedup += 1; perItem.push({ title: String(it?.title || id).slice(0, 44), status: it?.provenance_status, groups: itemClearedGroups, del: itemDeletes }); }
  }
  perItem.sort((a, b) => b.del - a.del);
  console.log(`\n=== STEP 1c TALLY (affected items: ${items.length}) ===`);
  console.log(`CLEARED for dedup: ${clearedGroups} full-identity groups across ${itemsToDedup} items -> ${clearedDeletes} rows to delete (keep earliest each)`);
  console.log(`HELD (delete nothing):`);
  console.log(`  MULTISECTION (legit, same claim across sections): ${multiSec} groups`);
  console.log(`  SPAN_DIVERGENT (same section, diff span; review):  ${spanDiv} groups`);
  console.log(`  OTHER_DIVERGENT (same section, diff src/tier/kind): ${otherDiv} groups`);
  console.log(`\n--- per-item cleared-delete counts ---`);
  for (const p of perItem) console.log(`  ${p.title.padEnd(44)} [${p.status}] ${p.groups} grp -> -${p.del}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
