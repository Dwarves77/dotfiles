/** Phase 1 probe #2 — pool WINNABILITY for the verified floor-class 62 ($0, read-only).
 *  A paid re-ground can only attribute FACTs to POOL sources. If an item's pool contains NO
 *  floor-qualifying source with usable text, the paid pass cannot clear the floor — unwinnable,
 *  route to honest quarantine + awaiting-refetch. Splits the population by winnability.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const { authorityFloorFor } = await jiti.import("../../src/lib/agent/source-blocks.mjs");
const sb = readClient();

let srcs = [];
for (let f = 0; ; f += 1000) {
  const { data } = await sb.from("sources").select("id,url,base_tier,tier_override").order("id").range(f, f + 999);
  if (!data?.length) break; srcs.push(...data); if (data.length < 1000) break;
}
const resolver = buildResolver(srcs);

const verified = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const winnable = [], unwinnable = [];
for (const it of verified) {
  const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const r = Array.isArray(vr) ? vr[0] : vr;
  if (r?.valid) continue;
  const reasons = [...new Set((r?.failures || []).map((f) => f.reason))];
  if (!reasons.includes("fact_below_authority_floor")) continue;
  const floor = authorityFloorFor(it.item_type);
  const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
  const rows = (pool || []).filter((p) => (p.result_content_excerpt || "").length > 200);
  const floorRows = rows.filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= floor; });
  const floorChars = floorRows.reduce((a, p) => a + (p.result_content_excerpt || "").length, 0);
  const rec = { key: it.legacy_id || it.id.slice(0, 8), id: it.id, type: it.item_type, floor,
    poolRows: rows.length, floorRows: floorRows.length, floorKB: Math.round(floorChars / 1000),
    floorHosts: [...new Set(floorRows.map((p) => { try { return new URL(p.result_url).hostname; } catch { return p.result_url; } }))].slice(0, 3) };
  (floorRows.length > 0 ? winnable : unwinnable).push(rec);
}
console.log(`WINNABLE (pool has >=1 floor-qualifying source w/ text): ${winnable.length}`);
for (const w of winnable) console.log(`  ${w.key.padEnd(14)} floor=${w.floor} floorRows=${w.floorRows} (${w.floorKB}KB) hosts=${w.floorHosts.join(",")}`);
console.log(`\nUNWINNABLE (0 floor-qualifying pool sources — paid ground cannot clear the floor): ${unwinnable.length}`);
for (const u of unwinnable) console.log(`  ${u.key.padEnd(14)} floor=${u.floor} pool=${u.poolRows} rows, 0 at/above floor`);
console.log(`\nsorted-lowest-id winnable (proof candidate): ${winnable.map((w) => w.id).sort()[0] || "none"}`);
process.exit(0);
