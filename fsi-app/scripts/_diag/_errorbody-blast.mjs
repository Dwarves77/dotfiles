// READ-ONLY BLAST RADIUS (dispatch item 2): every FACT claim whose grounded capture is an ERROR-BODY (a stored
// failed fetch). Uses the SINGLE-HOME isErrorBody (entity-gate.mjs) over stored capture content. Reports
// claim/item/verified counts + the two named breaches (355af9e8, 6f1e6615) + the 17 flipped items. ZERO writes.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const { isErrorBody } = await import("../../src/lib/sources/entity-gate.mjs");
const sb = readClient();

const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const pool = await readAll("agent_run_searches", "id,intelligence_item_id,result_url,result_content_excerpt");
const capById = new Map(pool.map((r) => [r.id, r]));
const claims = await readAll("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id,source_span");
const facts = claims.filter((c) => c.claim_kind === "FACT" && c.search_result_id);

let breachFacts = 0; const perItem = new Map();
for (const f of facts) {
  const cap = capById.get(f.search_result_id);
  if (!cap || !isErrorBody(cap.result_content_excerpt || "")) continue;
  breachFacts++;
  const it = byId.get(f.intelligence_item_id);
  const rec = perItem.get(f.intelligence_item_id) || { key: it ? (it.legacy_id || it.id.slice(0, 8)) : f.intelligence_item_id.slice(0, 8), verified: it?.provenance_status === "verified", facts: 0, hosts: new Set() };
  rec.facts++;
  try { rec.hosts.add(new URL(cap.result_url).host.replace(/^www\./, "")); } catch {}
  perItem.set(f.intelligence_item_id, rec);
}
const verifiedBreach = [...perItem.values()].filter((r) => r.verified);
console.log(`\n=== ERROR-BODY BLAST RADIUS ===`);
console.log(`  breach FACT claims: ${breachFacts} | distinct items: ${perItem.size} | VERIFIED (customer-visible): ${verifiedBreach.length}`);
console.log(`  VERIFIED breach items:`);
for (const r of verifiedBreach.sort((a, b) => b.facts - a.facts)) console.log(`    ${r.key.padEnd(30)} ${r.facts} FACT(s)  ${[...r.hosts].join(", ")}`);

console.log(`\n=== NAMED BREACHES ===`);
for (const k of ["355af9e8", "6f1e6615"]) {
  const it = items.find((x) => x.id.slice(0, 8) === k || x.legacy_id === k);
  if (!it) { console.log(`  ${k}: NOT FOUND`); continue; }
  const itFacts = facts.filter((f) => f.intelligence_item_id === it.id);
  const errG = itFacts.filter((f) => { const c = capById.get(f.search_result_id); return c && isErrorBody(c.result_content_excerpt || ""); });
  console.log(`  ${k}: status=${it.provenance_status} archived=${it.is_archived} | FACT=${itFacts.length}, error-grounded=${errG.length}`);
}

console.log(`\n=== 17 FLIPPED ITEMS — junk-grounding retro-check (only error-grounded shown) ===`);
const FLIPPED = ["5b9b05c7","r28","l10","sustainable-aviation-fuel-saf-production-pricing","g18","w4_ca_ab1305","7115c978","g34","uk-streamlined-energy-and-carbon-reporting-secr-amendment","g1","o1","de7f09fc","w4_ca_acf","g17","c3","c7","a3"];
let dirty = 0;
for (const k of FLIPPED) {
  const it = items.find((x) => x.legacy_id === k || x.id.slice(0, 8) === k);
  if (!it) { console.log(`  ${k}: NOT FOUND`); continue; }
  const itFacts = facts.filter((f) => f.intelligence_item_id === it.id);
  const errG = itFacts.filter((f) => { const c = capById.get(f.search_result_id); return c && isErrorBody(c.result_content_excerpt || ""); });
  if (errG.length) { dirty++; console.log(`  ${k.slice(0,42).padEnd(42)} status=${it.provenance_status} FACT=${itFacts.length} ERROR-GROUNDED=${errG.length}  <-- HOLD BACK`); }
}
console.log(`  flipped items with error-grounded FACTs: ${dirty} / ${FLIPPED.length} (0 = all clean)`);
process.exit(0);
