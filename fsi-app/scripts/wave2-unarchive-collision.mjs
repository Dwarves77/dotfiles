/** WAVE 2 ARCHIVE-COLLISION REVERSAL (operator ruling 2026-07-15). Un-archives the 19 collision items that a
 *  raw (un-guarded) disposition actor archived while they were inside my Wave-2 recovery window. Restores
 *  pre-collision state: is_archived=false + archive_reason/note cleared. GUARDED (snapshot per item) + cited,
 *  the correct-this-time reversal of an un-snapshotted flip. Does NOT re-execute any disposition (legitimate
 *  ones re-run later through a ruled, attributed channel). Re-validates each item after restore and reports
 *  per-item provenance_status + facts. Scope is EXACTLY the 19: is_archived=true AND updated_at today AND in
 *  the Wave-2 agent_runs window. Touches none of the corpus-wide 436-archive population.
 *  Usage: node scripts/wave2-unarchive-collision.mjs [--apply]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardedUpdate } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cite = { skill: "remediation-discipline", reason: "Wave 2 archive-collision reversal (operator ruling 2026-07-15): un-archive 19 items a raw un-guarded actor archived inside the recovery window; restore pre-collision state; guarded + snapshotted" };
const WAVE_START = "2026-07-15T15:02:10Z";

async function collisionIds() {
  const { data: runs } = await sb.from("agent_runs").select("intelligence_item_id").gte("started_at", WAVE_START).not("intelligence_item_id", "is", null);
  const wave = new Set((runs || []).map((r) => r.intelligence_item_id));
  const { data: arch } = await sb.from("intelligence_items").select("id, title, provenance_status, archive_reason, updated_at")
    .eq("is_archived", true).gte("updated_at", "2026-07-15T00:00:00Z");
  return (arch || []).filter((i) => wave.has(i.id));
}

async function factCount(id) {
  const { count } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", id).eq("claim_kind", "FACT");
  return count || 0;
}

async function main() {
  const items = await collisionIds();
  console.log(`\n=== WAVE 2 UN-ARCHIVE (${APPLY ? "APPLY" : "DRY"}) — ${items.length} collision items ===`);
  for (const it of items) {
    const facts = await factCount(it.id);
    if (!APPLY) {
      console.log(`  [DRY] ${String(it.title).slice(0,42).padEnd(42)} ${it.provenance_status} facts=${facts} reason=${it.archive_reason} -> would un-archive`);
      continue;
    }
    try {
      const r = await guardedUpdate("intelligence_items", (q) => q.eq("id", it.id),
        { is_archived: false, archive_reason: null, archive_note: null }, { cite });
      // re-validate + read back the resulting (trigger-derived) state
      const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
      const val = Array.isArray(v) ? v[0] : v;
      const { data: after } = await sb.from("intelligence_items").select("provenance_status, is_archived").eq("id", it.id).single();
      const factsAfter = await factCount(it.id);
      console.log(`  ${String(it.title).slice(0,42).padEnd(42)} restored: archived=${after?.is_archived} prov=${after?.provenance_status} valid=${val?.valid} facts=${factsAfter} (was ${it.archive_reason}) [snap ${String(r.snapshot).replace(/.*[\\/]/,'')}]`);
    } catch (e) {
      console.log(`  ${String(it.title).slice(0,42).padEnd(42)} !! FAILED: ${String(e.message).slice(0,120)}`);
    }
  }
  console.log(`\n=== ${APPLY ? "restored" : "would restore"} ${items.length} items (guarded, snapshotted) ===`);
}
main().catch((e) => { console.error(e); process.exit(1); });
