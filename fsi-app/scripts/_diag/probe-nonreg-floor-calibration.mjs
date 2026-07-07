/** READ-ONLY: ground the Stage-D1 non-reg authority-floor calibration. Per non-reg item_type: item count
 *  by provenance_status, and the tier distribution of its FACT claims (what authority its facts actually
 *  carry). Also count items currently in pending_human_verify (D2). No writes, no network. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const sb = readClient();

const REG = new Set(["regulation","directive","standard","guidance","framework"]);
const items = await readAll("intelligence_items", "id,item_type,priority,provenance_status", { match: (q)=>q.eq("is_archived", false) });
const byType = {};
for (const it of items) {
  const t = it.item_type || "(null)";
  byType[t] ??= { total:0, status:{}, reg: REG.has(t), prio:{} };
  byType[t].total++; byType[t].status[it.provenance_status]=(byType[t].status[it.provenance_status]||0)+1;
  byType[t].prio[it.priority]=(byType[t].prio[it.priority]||0)+1;
}
const itemType = new Map(items.map((i)=>[i.id, i.item_type]));
// FACT tier distribution per item_type (paginated)
const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,source_tier_at_grounding", { match:(q)=>q.eq("claim_kind","FACT") });
const tierByType = {};
for (const c of claims) {
  const t = itemType.get(c.intelligence_item_id); if (!t) continue;
  tierByType[t] ??= {};
  const k = c.source_tier_at_grounding ?? "null";
  tierByType[t][k]=(tierByType[t][k]||0)+1;
}

console.log("\n===== STAGE D1 — NON-REG FLOOR CALIBRATION (read-only) =====");
console.log("Per item_type: REG? | items | status split | FACT-claim tier distribution");
const order = Object.keys(byType).sort((a,b)=>(byType[a].reg===byType[b].reg)?b-a:(byType[a].reg?1:-1));
for (const t of Object.keys(byType).sort()) {
  const b = byType[t]; const tiers = tierByType[t]||{};
  const facts = Object.values(tiers).reduce((a,x)=>a+x,0);
  console.log(`\n  ${t}  ${b.reg?"[REG]":"[non-reg]"}  items=${b.total}`);
  console.log(`     status: ${JSON.stringify(b.status)}`);
  console.log(`     FACT claims=${facts}  tiers=${JSON.stringify(tiers)}`);
}
// D2: pending_human_verify
const phv = items.filter((i)=>i.provenance_status==="pending_human_verify");
console.log(`\n===== STAGE D2 — pending_human_verify =====`);
console.log(`items currently in pending_human_verify: ${phv.length}`);
if (phv.length) console.log(`  by type: ${JSON.stringify(phv.reduce((a,i)=>{a[i.item_type]=(a[i.item_type]||0)+1;return a;},{}))}`);
process.exit(0);
