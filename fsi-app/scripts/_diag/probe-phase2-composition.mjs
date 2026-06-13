/** STAGE C step 2 — COMPOSITION PROBE across the 30 flip items (read-only). Per item, count FACT claims by
 *  post-resolution anchor bucket: (i) primary-recoverable T1-2 (pass the reg floor), (ii) secondary T3-6
 *  (class-society/intergov/trade — relabel candidates), (iii) unregistered-host NULL. Plus the aggregate
 *  null-host tally that drives the step-3 Phase-0 sweep (authoritative-unregistered -> register; secondary
 *  -> leave). This is the data the layered method depends on. PURE READS. GOVERNING: source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const FLIP = {
  "eu_ets_directive_2023_959":"EU","eu_clean_trucking_2024_1610":"EU","7a0ead55":"EU","5cc10a6d":"EU","e2e03e1b":"EU",
  "eu-emissions-trading-system-ets-extension-to-maritime-transport":"EU","eu-corporate-sustainability-reporting-directive-csrd-transport-provisions":"EU",
  "eu-corporate-sustainability-reporting-directive-csrd-transport-sector-implementa":"EU","3ae89ce6":"EU","d5ee6ab8":"EU","o6":"EU",
  "93c344a1":"IMO",
  "d56ca4e1":"US","89656109":"US","0ea6a710":"US","cd5c84e3":"US","de2df788":"US","bec305e1":"US",
  "a4":"UK","782878c0":"UK","d935e112":"UK",
  "27dfbe4c":"non-EN","6a857887":"non-EN","ad4cc6c6":"non-EN","japan-green-transformation-gx-freight-transport-standards":"non-EN",
  "japan-s-updated-top-runner-program-for-heavy-duty-vehicles":"non-EN","india-s-national-logistics-policy-carbon-intensity-standards":"non-EN",
  "03b5f234":"non-EN","82f09535":"non-EN","g19":"non-EN",
};

const items = await readAll("intelligence_items", "id,legacy_id,title,provenance_status");
const byKey = new Map(); for (const it of items) { byKey.set(it.legacy_id, it); byKey.set(it.id.slice(0, 8), it); }
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id,source_tier_at_grounding");
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));
const factByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT") continue; if (!factByItem.has(c.intelligence_item_id)) factByItem.set(c.intelligence_item_id, []); factByItem.get(c.intelligence_item_id).push(c); }

const nullHosts = {};
console.log(`=== STEP 2: composition of the 30 flip items (current claim stamps) ===`);
console.log(`${"item".padEnd(20)} ${"cls".padEnd(6)} ${"stat".padEnd(11)} FACT  (i)T1-2  (ii)T3-6  (iii)null`);
let agg = { i: 0, ii: 0, iii: 0, fact: 0 }; const rows = [];
for (const [k, cls] of Object.entries(FLIP)) {
  const it = byKey.get(k); if (!it) { console.log(`  ${k} NOT FOUND`); continue; }
  const fcs = factByItem.get(it.id) || [];
  let i = 0, ii = 0, iii = 0;
  for (const c of fcs) {
    const t = c.source_tier_at_grounding;
    if (t === 1 || t === 2) i++;
    else if (t == null) { iii++; const h = hostOf(searchById.get(c.search_result_id)?.result_url || ""); if (h) nullHosts[h] = (nullHosts[h] || 0) + 1; }
    else ii++;
  }
  agg.i += i; agg.ii += ii; agg.iii += iii; agg.fact += fcs.length;
  rows.push({ k: it.legacy_id || it.id.slice(0, 8), cls, stat: it.provenance_status, fact: fcs.length, i, ii, iii });
}
for (const r of rows.sort((a, b) => (b.ii + b.iii) - (a.ii + a.iii)))
  console.log(`  ${r.k.padEnd(20)} ${r.cls.padEnd(6)} ${String(r.stat).padEnd(11)} ${String(r.fact).padStart(3)}  ${String(r.i).padStart(6)}  ${String(r.ii).padStart(7)}  ${String(r.iii).padStart(8)}`);
console.log(`\nAGGREGATE: ${agg.fact} FACTs | (i) primary T1-2 ${agg.i} | (ii) secondary T3-6 ${agg.ii} | (iii) unregistered null ${agg.iii}`);
console.log(`items already all-(i) [would verify on re-ground]: ${rows.filter((r) => r.ii === 0 && r.iii === 0 && r.fact > 0).length}`);

console.log(`\n=== STEP 3 INPUT: null-anchor hosts across the 30 (triage: authoritative->register, secondary->leave) ===`);
for (const [h, n] of Object.entries(nullHosts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${h}`);
process.exit(0);
