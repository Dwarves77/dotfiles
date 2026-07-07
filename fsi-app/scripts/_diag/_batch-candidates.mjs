// READ-ONLY: classify the 70 quarantined items by failure class + whether a STORED POOL exists, to compose a
// sound GROUND-ONLY batch (missing_required_slot = slot-forcing's target; unlabeled/no_section/floor are the
// wrong tool for ground-only). Reports the ground-only-friendly cold set.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const items = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,last_regenerated_at", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const classOf = async (id) => { const { data } = await sb.rpc("validate_item_provenance", { p_item_id: id }); const r = Array.isArray(data) ? data[0] : data; return [...new Set((r?.failures || []).map((f) => f.reason))]; };
const poolChars = async (id) => { const rows = await readAll("agent_run_searches", "result_content_excerpt", { match: (q) => q.eq("intelligence_item_id", id) }); return rows.reduce((a, r) => a + (r.result_content_excerpt || "").length, 0); };

const rows = [];
for (const it of items) { const reasons = await classOf(it.id); rows.push({ it, reasons }); }
const tally = {};
for (const r of rows) for (const rz of r.reasons) tally[rz] = (tally[rz] || 0) + 1;
console.log("=== quarantined failure-class tally (70) ===", JSON.stringify(tally, null, 0));

// ground-only friendly = has missing_required_slot AND NOT dominated by classes ground-only can't fix
const GROUND_FIXABLE = new Set(["missing_required_slot"]);
const NOT_GROUND = new Set(["no_section_content"]); // no content to ground against
const friendly = rows.filter((r) => r.reasons.some((x) => GROUND_FIXABLE.has(x)) && !r.reasons.some((x) => NOT_GROUND.has(x)));
console.log(`\n=== GROUND-ONLY-FRIENDLY (has missing_required_slot, no no_section_content): ${friendly.length} ===`);
for (const r of friendly.slice(0, 20)) {
  const pc = await poolChars(r.it.id);
  console.log(`  ${(r.it.legacy_id || r.it.id.slice(0, 8)).slice(0, 40).padEnd(40)} ${r.it.item_type.padEnd(12)} ${(r.it.priority || "?").padEnd(9)} pool=${(pc / 1000).toFixed(0)}KB regen=${String(r.it.last_regenerated_at).slice(0, 10)} [${r.reasons.join(",")}]`);
}
process.exit(0);
