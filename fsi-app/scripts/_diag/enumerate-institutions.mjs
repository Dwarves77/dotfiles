/** PHASE 0' data backbone (read-only). Enumerate every claim-grounding host, grouped to institution
 *  (eTLD+1, with documented subdomain exceptions), with: total FACT claims, CRITICAL/HIGH REG claims,
 *  registered? + the set of CURRENT tiers across that institution's source rows (the inconsistency).
 *  Writes scripts/_diag/institutions.json for the tier-sheet build. PURE READS. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const tierOf = (s) => (s.effective_tier ?? s.base_tier ?? null);

// minimal public-suffix set for eTLD+1 (multi-label suffixes seen in this corpus)
// Multi-label suffixes AND shared government super-domains where the SUBDOMAIN is the institution
// (eur-lex.europa.eu vs eea.europa.eu are different bodies at different honest tiers — the documented
// subdomain-exception class). Single-institution domains (imo.org, mit.edu) stay grouped to eTLD+1.
const TWO_LEVEL = new Set(["co.uk","gov.uk","ac.uk","org.uk","com.br","gov.br","org.br","co.jp","go.jp","or.jp","ne.jp","gov.cn","com.cn","edu.cn","org.cn","gov.au","com.au","edu.au","org.au","gov.in","co.in","org.in","nic.in","gov.sg","com.sg","go.kr","or.kr","re.kr","gob.mx","gov.co","gob.cl","gc.ca","go.id","gov.za","gov.hk",
  "europa.eu","canada.ca","ca.gov","ny.gov","tx.us","state.tx.us","wa.gov","or.us","ne.gov","nj.gov","pa.gov","mass.gov","oregon.gov","nc.gov","ct.gov"]);
function institution(host) {
  if (!host) return "";
  const h = host.replace(/^www\./, "").toLowerCase();
  const p = h.split(".");
  if (p.length <= 2) return h;
  const lastTwo = p.slice(-2).join(".");
  const reg = TWO_LEVEL.has(lastTwo) ? p.slice(-3).join(".") : p.slice(-2).join(".");
  return reg;
}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const items = await readAll("intelligence_items", "id,item_type,priority,is_archived");
const sources = await readAll("sources", "id,url,base_tier,effective_tier,status,name");
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const itemById = new Map(items.map((i) => [i.id, i]));
const searchById = new Map(searches.map((r) => [r.id, r]));

// institution -> registered source rows (tiers + sample names)
const inst = new Map();
const get = (k) => { let e = inst.get(k); if (!e) { e = { key: k, factClaims: 0, regHighClaims: 0, srcRows: 0, tiers: new Set(), names: new Set(), exampleHosts: new Set() }; inst.set(k, e); } return e; };
for (const s of sources) {
  const k = institution(hostOf(s.url)); if (!k) continue;
  const e = get(k); e.srcRows++; const t = tierOf(s); if (t != null) e.tiers.add(t); if (s.name) e.names.add(s.name);
}
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const it = itemById.get(c.intelligence_item_id); if (!it || it.is_archived) continue;
  const sr = searchById.get(c.search_result_id); if (!sr) continue;
  const h = hostOf(sr.result_url); const k = institution(h); if (!k) continue;
  const e = get(k); e.factClaims++; e.exampleHosts.add(h);
  if (HIGH.has(it.priority) && REG_TYPES.has(it.item_type)) e.regHighClaims++;
}

const arr = [...inst.values()].filter((e) => e.factClaims > 0)
  .map((e) => ({ key: e.key, factClaims: e.factClaims, regHighClaims: e.regHighClaims, srcRows: e.srcRows,
                 tiers: [...e.tiers].sort(), inconsistent: e.tiers.size > 1, registered: e.srcRows > 0,
                 exampleHosts: [...e.exampleHosts].slice(0, 3), name: [...e.names][0] || "" }))
  .sort((a, b) => b.factClaims - a.factClaims);

writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "institutions.json"), JSON.stringify(arr, null, 2));
const inconsistent = arr.filter((e) => e.inconsistent);
const unregistered = arr.filter((e) => !e.registered);
console.log(`grounding institutions: ${arr.length}  | inconsistent-tier: ${inconsistent.length}  | unregistered: ${unregistered.length}`);
console.log(`total FACT claims grounded: ${arr.reduce((n, e) => n + e.factClaims, 0)}`);
console.log(`\n=== ALL grounding institutions (claims | regHigh | rows | curTiers | name/host) ===`);
for (const e of arr)
  console.log(`${String(e.factClaims).padStart(4)} ${String(e.regHighClaims).padStart(4)}reg ${String(e.srcRows).padStart(2)}r [${(e.tiers.join(",")||"-").padEnd(9)}] ${e.inconsistent?"INC":"   "} ${e.registered?"   ":"UNR"} ${e.key.padEnd(34)} ${(e.name||e.exampleHosts[0]||"").slice(0,38)}`);
process.exit(0);
