// READ-ONLY: the ground-only-eligible cascade set + cost estimate. Eligible = quarantined, has
// missing_required_slot, NOT verified, NOT counsel-held (no open phase2_priority_review), has a stored pool.
// Counsel-held + floor-only + unlabeled-only are excluded (wrong tool / seek-more, not paid ground).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { costUsdForModel } = await jiti.import("@/lib/agent/generation-config.ts");
const sb = readClient();
const K = 3;

const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const REQ = (await sb.from("item_type_required_slots").select("item_type,slot_key")).data || [];
const counselHeld = new Set((await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("subject_type", "item").eq("status", "open").eq("created_by", "phase2_priority_review") })).map((f) => f.subject_ref));

let est = 0, n = 0; const byType = {}, byPri = {};
for (const it of items) {
  const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(data) ? data[0] : data;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  if (!reasons.includes("missing_required_slot")) continue;
  if (counselHeld.has(it.id)) continue;
  const pool = await readAll("agent_run_searches", "result_content_excerpt", { match: (q) => q.eq("intelligence_item_id", it.id) });
  const poolChars = Math.min(560000, pool.reduce((a, x) => a + (x.result_content_excerpt || "").length, 0));
  if (poolChars < 500) continue; // no usable pool
  const nSlots = REQ.filter((x) => x.item_type === it.item_type).length;
  const e = costUsdForModel("claude-sonnet-4-6", Math.round(poolChars / 4), 8000) + costUsdForModel("claude-haiku-4-5", nSlots * K * 300, nSlots * K * 40);
  est += e; n++;
  byType[it.item_type] = (byType[it.item_type] || 0) + 1;
  byPri[it.priority || "?"] = (byPri[it.priority || "?"] || 0) + 1;
}
console.log(`\n=== GROUND-ONLY-ELIGIBLE CASCADE SET ===`);
console.log(`  eligible items: ${n}`);
console.log(`  by type: ${JSON.stringify(byType)}`);
console.log(`  by priority: ${JSON.stringify(byPri)}`);
console.log(`  total estimated ground+judge cost: $${est.toFixed(2)} (avg $${(est / (n || 1)).toFixed(4)}/item)`);
console.log(`  counsel-held excluded: ${counselHeld.size}`);
console.log(`  program now ~$15.80 → cascade lands ~$${(15.795 + est).toFixed(2)} / $85 (soft-cap $80)`);
process.exit(0);
