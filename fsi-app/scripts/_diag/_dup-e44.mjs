import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const items = await readAll("intelligence_items","id,legacy_id,title,item_type,provenance_status,source_url,is_archived,jurisdictions");
const live = items.filter((i)=>!i.is_archived);
const e44 = live.find((x)=>x.id.slice(0,8)==="e44a5408");
console.log("TARGET:", (e44.title||"").slice(0,70), "| juris:", JSON.stringify(e44.jurisdictions));
// near-duplicates: UK transport decarbonisation / greener britain
const rx = /decarbonis|greener britain|transport.*plan|uk.*transport|tdp/i;
const cand = live.filter((i)=>i.id!==e44.id && (rx.test(i.title||"") || (i.jurisdictions||[]).some((j)=>/GB|UK/i.test(j)) && /decarbon|transport/i.test(i.title||"")));
console.log("UK transport-decarbonisation-ish live items:", cand.length);
for (const c of cand.slice(0,12)) console.log(`  ${c.id.slice(0,8)} [${c.item_type}/${c.provenance_status}] ${(c.title||"").slice(0,58)}`);
// also: same source_url?
const sameUrl = live.filter((i)=>i.id!==e44.id && i.source_url===e44.source_url);
console.log("same source_url:", sameUrl.length);
process.exit(0);
