// Phase 4 END-TO-END production confirm (read-only). Calls the LIVE validate_item_provenance (migration
// 145) for every item and proves 0 blast radius: no currently-verified item flips to quarantined, and
// specifically none via the authority floor (fact_below_authority_floor). Only reads + STABLE RPC calls.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const items = await readAll("intelligence_items", "id,provenance_status,priority,item_type");
let verifiedToQuar = 0, quarToVerified = 0, floorRegression = 0, errs = 0, called = 0;
const xtab = {}; // `${cur}->${rec}` counts
const regressionSample = [];

for (const it of items) {
  const { data, error } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  if (error) { errs++; continue; }
  const vr = Array.isArray(data) ? data[0] : data;
  if (!vr) { errs++; continue; }
  called++;
  const cur = it.provenance_status ?? "null";
  const rec = vr.recommended_status ?? "null";
  xtab[`${cur}->${rec}`] = (xtab[`${cur}->${rec}`] || 0) + 1;
  if (cur === "verified" && rec === "quarantined") {
    verifiedToQuar++;
    const fails = Array.isArray(vr.failures) ? vr.failures : [];
    if (fails.some((f) => f?.reason === "fact_below_authority_floor")) {
      floorRegression++;
      if (regressionSample.length < 8) regressionSample.push(`${it.id.slice(0, 8)} ${it.item_type}/${it.priority}`);
    }
  }
  if (cur === "quarantined" && rec === "verified") quarToVerified++;
}

console.log(`\n=========== PHASE 4 PRODUCTION CONFIRM (live RPC, read-only) ===========`);
console.log(`items: ${items.length}  RPC ok: ${called}  errors: ${errs}`);
console.log(`current verified -> now quarantined (ANY reason): ${verifiedToQuar}`);
console.log(`  ...of those, via the AUTHORITY FLOOR (the only thing 145 changed): ${floorRegression}  <-- MUST be 0`);
console.log(`current quarantined -> now verified: ${quarToVerified}`);
if (regressionSample.length) console.log(`  floor-regression sample: ${regressionSample.join(", ")}`);
console.log(`\ncurrent->recommended cross-tab:`);
for (const [k, v] of Object.entries(xtab).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`\n${floorRegression === 0 ? "PASS — 0 floor-caused flips: the inline-derive floor is behavior-identical in production (0 blast radius)." : `FAIL — ${floorRegression} floor regressions!`}`);
console.log(`========================================================================`);
process.exit(floorRegression === 0 ? 0 : 1);
