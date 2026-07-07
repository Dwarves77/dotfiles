import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const items = await readAll("intelligence_items", "id,full_brief", { match:(q)=>q.eq("is_archived", false) });
const withBrief = items.filter(it => (it.full_brief||"").length > 400);
const secs = await readAll("intelligence_item_sections", "item_id");
const claims = await readAll("section_claim_provenance", "intelligence_item_id");
const pool = await readAll("agent_run_searches", "intelligence_item_id");
const S=new Set(secs.map(s=>s.item_id)), C=new Set(claims.map(c=>c.intelligence_item_id)), P=new Set(pool.map(p=>p.intelligence_item_id));
console.log(`built-brief items: ${withBrief.length}`);
console.log(`  WITH scraped pool (agent_run_searches): ${withBrief.filter(it=>P.has(it.id)).length}`);
console.log(`  WITH sections (intelligence_item_sections): ${withBrief.filter(it=>S.has(it.id)).length}`);
console.log(`  WITH claims (section_claim_provenance):    ${withBrief.filter(it=>C.has(it.id)).length}`);
