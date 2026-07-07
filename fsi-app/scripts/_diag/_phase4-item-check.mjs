import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const ITEM = "4a108d70";
const items = await readAll("intelligence_items", "id,provenance_status,priority,item_type");
const it = items.find((i) => i.id.startsWith(ITEM));
console.log(`item ${it.id.slice(0,8)} ${it.item_type}/${it.priority} status=${it.provenance_status} (floor_max=2 for reg-family)`);
const sources = await readAll("sources", "id,base_tier,tier_override");
const src = new Map(sources.map((s)=>[s.id,s]));
const { data: claims } = await sb.from("section_claim_provenance").select("id,claim_kind,source_id,source_tier_at_grounding").eq("intelligence_item_id", it.id).eq("claim_kind","FACT");
console.log(`FACT claims: ${claims.length}`);
let storedFail=0, derivedFail=0, mismatch=0;
for (const c of claims) {
  const s = c.source_id ? src.get(c.source_id) : null;
  const derived = s ? (s.tier_override ?? s.base_tier ?? null) : null;
  const stored = c.source_tier_at_grounding ?? null;
  const sFail = stored==null || stored>2;
  const dFail = derived==null || derived>2;
  if (stored!==derived) mismatch++;
  if (sFail) storedFail++;
  if (dFail) derivedFail++;
  if (stored!==derived || sFail || dFail) console.log(`  claim ${c.id.slice(0,8)} stored=${stored} derived=${derived} src=${c.source_id?c.source_id.slice(0,8):"NULL"} storedFailFloor=${sFail} derivedFailFloor=${dFail}`);
}
console.log(`\nSUMMARY: stored!=derived mismatches=${mismatch} | claims failing floor under STORED(143)=${storedFail} | under DERIVED(145)=${derivedFail}`);
console.log(mismatch===0 && storedFail===derivedFail ? "=> 143 and 145 give IDENTICAL floor result for this item; the verified->quarantined is PRE-EXISTING (stale status), NOT a 145 regression." : "=> investigate: 145 differs from 143 here.");
