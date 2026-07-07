import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();

const items = await readAll("intelligence_items", "id,full_brief", { match:(q)=>q.eq("is_archived", false) });
const withBrief = items.filter(it => (it.full_brief||"").length > 400);
console.log(`non-archived items: ${items.length} | with full_brief(built): ${withBrief.length}`);

// scraped pool
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolByItem = {}; let totalChars=0, maxLen=0;
for (const p of pool) { const L=(p.result_content_excerpt||"").length; totalChars+=L; if(L>maxLen)maxLen=L; (poolByItem[p.intelligence_item_id] ||= []).push(L); }
const itemsWithPool = new Set(pool.map(p=>p.intelligence_item_id));
const briefItemsWithPool = withBrief.filter(it=>itemsWithPool.has(it.id)).length;
console.log(`\nSCRAPED (agent_run_searches): ${pool.length} rows, ${(totalChars/1e6).toFixed(1)}M chars total, max row ${maxLen} chars`);
console.log(`  built-brief items that HAVE a stored scraped pool: ${briefItemsWithPool}/${withBrief.length}`);
// size distribution of scraped content (is it full pages or truncated stubs?)
const lens = pool.map(p=>(p.result_content_excerpt||"").length).sort((a,b)=>a-b);
const pct = (p)=>lens[Math.floor(lens.length*p)]||0;
console.log(`  scraped row length: p50=${pct(.5)} p90=${pct(.9)} p99=${pct(.99)} (full page text, not stubs, if p90 is thousands)`);

// built artifacts: sections + claims
const secs = await readAll("intelligence_item_sections", "intelligence_item_id");
const claims = await readAll("section_claim_provenance", "intelligence_item_id");
const itemsWithSec = new Set(secs.map(s=>s.intelligence_item_id));
const itemsWithClaims = new Set(claims.map(c=>c.intelligence_item_id));
console.log(`\nBUILT artifacts:`);
console.log(`  sections rows: ${secs.length} | brief-items WITH sections: ${withBrief.filter(it=>itemsWithSec.has(it.id)).length}/${withBrief.length}`);
console.log(`  claim rows: ${claims.length} | brief-items WITH claims: ${withBrief.filter(it=>itemsWithClaims.has(it.id)).length}/${withBrief.length}`);
console.log(`\nbrief-items MISSING a scraped pool (would need re-scrape to reground): ${withBrief.filter(it=>!itemsWithPool.has(it.id)).length}`);
