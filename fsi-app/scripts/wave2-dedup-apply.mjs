/** WAVE 2 dedup STEP 2 — CORRECTED guarded dedup ($0). Deletes ONLY full-identity duplicate rows:
 *  rows sharing (intelligence_item_id, section_row_id, claim_text, source_id, source_tier_at_grounding,
 *  claim_kind, source_span) — byte-identical except id/extracted_at, the proven race artifacts. Keeps the
 *  EARLIEST row per group (min extracted_at, tiebreak min id). Guarded delete -> snapshot for rollback.
 *  SUPERSEDES wave2-dedup-race.mjs (which keyed on claim_text ALONE and would have destroyed the 163
 *  legitimate MULTISECTION claims — same claim_text across different sections, control-proven pre-existing).
 *  Re-validates each touched item after. Usage: node scripts/wave2-dedup-apply.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedDelete } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "remediation-discipline", reason: "Wave 2 concurrent-race Step 2: delete full-identity duplicate claim rows (item+section+claim+source+tier+kind+span), keep earliest; multi-section legit claims untouched; guarded" };
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
  console.log(`\n=== WAVE 2 DEDUP STEP 2 (${APPLY ? "APPLY" : "DRY"}) — ${items.length} affected items scanned ===`);
  let totalDeleted = 0, itemsTouched = 0;
  for (const id of items) {
    const { data: claims } = await sb.from("section_claim_provenance")
      .select(["id", "claim_text", "extracted_at", ...FULL].join(",")).eq("intelligence_item_id", id);
    const groups = new Map();
    for (const c of claims || []) { const k = JSON.stringify([c.claim_text, ...FULL.map((f) => c[f] ?? null)]); (groups.get(k) || groups.set(k, []).get(k)).push(c); }
    const toDelete = [];
    for (const [, rows] of groups) {
      if (rows.length <= 1) continue;
      rows.sort((a, b) => (String(a.extracted_at ?? "") + a.id).localeCompare(String(b.extracted_at ?? "") + b.id));
      toDelete.push(...rows.slice(1).map((r) => r.id)); // keep earliest
    }
    if (!toDelete.length) continue;
    itemsTouched += 1;
    if (APPLY) await guardedDelete("section_claim_provenance", toDelete, { cite });
    totalDeleted += toDelete.length;
    const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: id });
    const r = Array.isArray(v) ? v[0] : v;
    const { count: facts } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id).eq("claim_kind", "FACT");
    const { data: it } = await sb.from("intelligence_items").select("title, provenance_status").eq("id", id).single();
    console.log(`  ${String(it?.title).slice(0, 44).padEnd(44)} -${toDelete.length} | FACTs now ${facts} | ${r?.valid ? "VALID" : "held"} | status=${it?.provenance_status}`);
  }
  console.log(`\n=== ${APPLY ? "DELETED" : "would delete"} ${totalDeleted} full-identity duplicate rows across ${itemsTouched} items ===`);
}
main().catch((e) => { console.error(e); process.exit(1); });
