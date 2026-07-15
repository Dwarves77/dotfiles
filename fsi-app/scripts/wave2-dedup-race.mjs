/** WAVE 2 concurrent-race CLEANUP (2026-07-15 incident). Two funded-pass processes raced the same worklist
 *  (first launch's nohup child survived a wrapper exit + the relaunch), double-inserting claims on ~11 items.
 *  This removes the EXACT-duplicate claim rows (same intelligence_item_id + claim_text), keeping the EARLIEST
 *  row per group (guarded delete -> snapshot for rollback). Sections were NOT doubled (section-reconcile held).
 *  The 2 zeroed items (claims cascade-deleted by an interrupted ground, kill pre-empted the guard's restore) are
 *  NOT touched here — they recover via a clean single-process re-ground. Re-validates each item after.
 *  Usage: node scripts/wave2-dedup-race.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedDelete } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "remediation-discipline", reason: "Wave 2 concurrent-race cleanup: remove exact-duplicate claim rows (same item+claim_text), keep earliest; guarded" };

async function main() {
  // touched items = Wave-2 priced-line markers in the last 2h
  const { data: markers } = await sb.from("agent_runs").select("intelligence_item_id")
    .eq("fetch_method", "priced-line").gte("started_at", new Date(Date.now() - 2 * 3600e3).toISOString());
  const itemIds = [...new Set((markers || []).map((m) => m.intelligence_item_id).filter(Boolean))];
  console.log(`\n=== WAVE 2 DEDUP (${APPLY ? "APPLY" : "DRY"}) — ${itemIds.length} touched items ===`);

  let totalDeleted = 0;
  for (const id of itemIds) {
    const { data: claims } = await sb.from("section_claim_provenance")
      .select("id, claim_text, extracted_at").eq("intelligence_item_id", id);
    // group by claim_text; keep the earliest (min extracted_at, tiebreak min id); delete the rest
    const groups = new Map();
    for (const c of claims || []) {
      const k = c.claim_text ?? "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const toDelete = [];
    for (const [, rows] of groups) {
      if (rows.length <= 1) continue;
      rows.sort((a, b) => (String(a.extracted_at ?? "") + a.id).localeCompare(String(b.extracted_at ?? "") + b.id));
      toDelete.push(...rows.slice(1).map((r) => r.id)); // keep rows[0], delete the rest
    }
    if (!toDelete.length) continue;
    if (APPLY) await guardedDelete("section_claim_provenance", toDelete, { cite });
    totalDeleted += toDelete.length;
    const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: id });
    const r = Array.isArray(v) ? v[0] : v;
    const { count: after } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id).eq("claim_kind", "FACT");
    const { data: it } = await sb.from("intelligence_items").select("title, provenance_status").eq("id", id).single();
    console.log(`  ${String(it?.title).slice(0, 40).padEnd(40)} -${toDelete.length} dupes | facts now ${after} | ${r?.valid ? "VALID" : "held"}`);
  }
  console.log(`\n=== ${APPLY ? "DELETED" : "would delete"} ${totalDeleted} duplicate claim rows across ${itemIds.length} items ===`);
}
main().catch((e) => { console.error(e); process.exit(1); });
