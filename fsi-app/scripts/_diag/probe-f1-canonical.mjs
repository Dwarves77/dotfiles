/** A3: honest flip set under the CANONICAL institution resolver reading ACTUAL DB tiers (post Phase 0').
 *  This is the resolver Phase 1's stamp will use: span host -> institution (eTLD+1 w/ exceptions) ->
 *  canonical base_tier from registered sources (consistent post-0'); per-row tier_override wins if the
 *  span's exact host carries one; NULL when the institution is unregistered. GOVERNING: source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
import { MAP } from "./tier-map.mjs"; // only for an "uncurated registered host" advisory; resolver uses DB
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./,"").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL","HIGH"]);
const REG_TYPES = new Set(["regulation","directive","standard","guidance","framework"]);
const TWO_LEVEL = new Set(["co.uk","gov.uk","ac.uk","org.uk","com.br","gov.br","org.br","co.jp","go.jp","or.jp","ne.jp","gov.cn","com.cn","edu.cn","org.cn","gov.au","com.au","edu.au","org.au","gov.in","co.in","org.in","nic.in","gov.sg","com.sg","go.kr","or.kr","re.kr","gob.mx","gov.co","gob.cl","gc.ca","go.id","gov.za","gov.hk","europa.eu","canada.ca","ca.gov","ny.gov","tx.us","state.tx.us","wa.gov","or.us","ne.gov","nj.gov","pa.gov","mass.gov","oregon.gov","nc.gov","ct.gov"]);
function institution(host){ if(!host) return ""; const h=host.replace(/^www\./,"").toLowerCase(); const p=h.split("."); if(p.length<=2) return h; const lt=p.slice(-2).join("."); return TWO_LEVEL.has(lt)?p.slice(-3).join("."):p.slice(-2).join("."); }

const items = await readAll("intelligence_items","id,legacy_id,title,item_type,priority,provenance_status,is_archived");
const sources = await readAll("sources","id,url,base_tier,effective_tier,tier_override");
const claims = await readAll("section_claim_provenance","id,intelligence_item_id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches","id,result_url");
const itemById = new Map(items.map(i=>[i.id,i]));
const searchById = new Map(searches.map(r=>[r.id,r]));

// institution -> canonical base_tier (consistent); host -> override row (exact-host override)
const instTier = new Map(); const overrideByHost = new Map();
for (const s of sources){ const h=hostOf(s.url); const k=institution(h); if(!k) continue;
  if (s.tier_override!=null) overrideByHost.set(h, s.tier_override);
  if (!instTier.has(k)) instTier.set(k, s.base_tier); }

function resolveTier(c){
  const sr = searchById.get(c.search_result_id); if(!sr) return null;
  const h = hostOf(sr.result_url); if(!h) return null;
  if (overrideByHost.has(h)) return overrideByHost.get(h);        // deliberate per-row override wins
  const k = institution(h); return instTier.has(k) ? instTier.get(k) : null; // canonical, NULL if unregistered
}

let highFact=0, fail=0; const tierHist={}; const flipRegs=new Map(); const flipNon=new Set(); let unreg=0;
for (const c of claims){
  if (c.claim_kind!=="FACT") continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it||it.is_archived||!HIGH.has(it.priority)) continue;
  highFact++;
  const t = resolveTier(c);
  const pass = t===1||t===2;
  if (!pass){ fail++; const tk=t==null?"null":String(t); tierHist[tk]=(tierHist[tk]||0)+1; if(t==null) unreg++;
    const key=it.legacy_id||it.id.slice(0,8);
    if (REG_TYPES.has(it.item_type)){ const e=flipRegs.get(key)||{n:0,it}; e.n++; flipRegs.set(key,e);} else flipNon.add(key); }
}
console.log(`=== A3: honest flip set — CANONICAL resolver on live DB tiers (post Phase 0') ===`);
console.log(`CRITICAL/HIGH FACT claims: ${highFact} | fail floor: ${fail} | unregistered(NULL): ${unreg}`);
console.log(`failing real-tier histogram: ${JSON.stringify(tierHist)}`);
console.log(`\nREG items FLIP: ${flipRegs.size} | non-reg exempt still-failing: ${flipNon.size}`);
console.log([...flipRegs.keys()].sort().join(", "));
console.log(`\nflip composition (item: failing-claim count, status):`);
for (const [k,e] of [...flipRegs.entries()].sort((a,b)=>b[1].n-a[1].n))
  console.log(`  ${k.padEnd(58)} ${String(e.n).padStart(3)}  ${e.it.provenance_status}  ${(e.it.title||"").slice(0,30)}`);
process.exit(0);
