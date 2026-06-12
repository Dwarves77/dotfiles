/** PHASE 0' tier sheet (read-only). GOVERNING: source-credibility-model.
 *  Proposes ONE canonical institutional tier per grounding institution per the model's type hierarchy.
 *  Flip-critical boundary = T1-2 (regulator/legal/official record, PASSES floor) vs T3+ (intergov
 *  analysis / academic / industry body / press / advisory, FAILS). Curated map for flip-relevant
 *  institutions; heuristic fallback for the long tail (non-reg, exempt). Then re-runs the Option-B
 *  flip simulation on the PROPOSED tiers and emits the ratification subset. Writes a full sheet to
 *  scripts/_diag/tier-sheet.md. PURE READS. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const D = dirname(fileURLToPath(import.meta.url));

const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation","directive","standard","guidance","framework"]);
const TWO_LEVEL = new Set(["co.uk","gov.uk","ac.uk","org.uk","com.br","gov.br","org.br","co.jp","go.jp","or.jp","ne.jp","gov.cn","com.cn","edu.cn","org.cn","gov.au","com.au","edu.au","org.au","gov.in","co.in","org.in","nic.in","gov.sg","com.sg","go.kr","or.kr","re.kr","gob.mx","gov.co","gob.cl","gc.ca","go.id","gov.za","gov.hk","europa.eu","canada.ca","ca.gov","ny.gov","tx.us","state.tx.us","wa.gov","or.us","ne.gov","nj.gov","pa.gov","mass.gov","oregon.gov","nc.gov","ct.gov"]);
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
function institution(host) {
  if (!host) return ""; const h = host.replace(/^www\./, "").toLowerCase(); const p = h.split(".");
  if (p.length <= 2) return h;
  const lastTwo = p.slice(-2).join("."); return TWO_LEVEL.has(lastTwo) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

// ── curated canonical tiers (flip-critical set), per source-credibility-model ──
// T1 legal text / legislatures; T2 regulators / gov agencies / official records;
// T3 intergovernmental analysis + academic/research + gov statistical;
// T4 industry/trade/standards/classification bodies; T5 trade press; T6 analysis/advisory/law-firm/NGO.
const MAP = {
  // T1 — primary legal text / legislatures / official legal publishers
  "eur-lex.europa.eu":1,"legislation.gov.uk":1,"texas.gov":1,"ncleg.gov":1,"ksrevisor.gov":1,"ms.gov":1,
  "oah.nc.gov":1,"planalto.gov.br":1,"montreal.ca":1,"phila.gov":1,"energystar.gov":1,"dmv.ca.gov":1,"ecfr.gov":1,"federalregister.gov":1,
  // T2 — regulators / government agencies / official records
  "ec.europa.eu":2,"commission.europa.eu":2,"europarl.europa.eu":2,"emsa.europa.eu":2,"epa.gov":2,"epa.ie":2,
  "nyc.gov":2,"imo.org":2,"icao.int":2,"parliament.uk":2,"sdir.no":2,"regjeringen.no":2,"customs.go.jp":2,"mof.go.jp":2,"meti.go.jp":2,"mlit.go.jp":2,
  "portal.ct.gov":2,"ct.gov":2,"gov.uk":2,"business.gov.uk":2,"pib.gov.in":2,"gao.gov":2,"energy.gov":2,"dot.gov":2,"dot.ny.gov":2,"ncdot.gov":2,
  "vic.gov.au":2,"njeda.gov":2,"dehst.de":2,"cssf.lu":2,"osc.ny.gov":2,"governor.nc.gov":2,"state.tx.us":2,"lancaster.gov.uk":2,"trade.gov":2,
  "www.gov.cn":2,"portoflosangeles.org":2,"cleanairactionplan.org":2,"dot.ca.gov":2,"arb.ca.gov":2,"canada.ca":2,"gov.br":2,"gov.pl":2,"ks.gov":2,
  "nabers.gov.au":2,"oregon.gov":2,"nm.gov":2,"wa.gov":2,"energy.ca.gov":2,"acea.auto":4,
  // T3 — intergovernmental analysis + academic/research + gov statistical
  "icapcarbonaction.com":3,"iea.org":3,"eia.gov":3,"worldbank.org":3,"oecd.org":3,"itf-oecd.org":3,"wto.org":3,"unctad.org":3,
  "weforum.org":3,"iadb.org":3,"asean.org":3,"ipcc.ch":3,"cepal.org":3,"un.org":3,"ilo.org":3,"cciced.eco":3,"mission-innovation.net":3,
  "unesco.org":3,"bls.gov":3,"ers.usda.gov":3,"nih.gov":3,"stlouisfed.org":3,"cranfield.ac.uk":3,"sei.org":3,"csrf.ac.uk":3,"tyndall.ac.uk":3,
  "wri.org":3,"erim.eur.nl":3,"sustainable.mit.edu":3,"mit.edu":3,"nlr.gov":2,"iml.fraunhofer.de":3,"tandfonline.com":3,"nature.com":3,"sciencedirect.com":3,"arxiv.org":3,"link.springer.com":3,"nationalacademies.org":3,
  // T4 — industry / trade / standards / classification bodies
  "lr.org":4,"dnv.com":4,"classnk.or.jp":4,"bureauveritas.com":4,"bimco.org":4,"clecat.org":4,"aecc.eu":4,"espo.be":4,
  "iso.org":4,"iata.org":4,"rvia.org":4,"advancedenergy.org":4,"clean-trucking.eu":4,"theicct.org":4,"carbontrust.com":4,"ghgprotocol.org":4,
  "transportpolicy.net":4,"tuv.com":4,"packagingeurope.com":5,"smartfreightcentre.org":4,"usgbc.org":4,"dromon.com":4,"globalmaritimeforum.org":4,"sustainablepackaging.org":4,
  // T5 — trade press / news
  "dieselnet.com":5,"sustainable-bus.com":5,"truckinginfo.com":5,"maritime-executive.com":5,"freightcourse.com":5,"logisticsinsider.in":5,
  "logishift.net":5,"chiefengineerlog.com":5,"newyorktruckingonline.com":5,"intertek.com":5,"supplychaindigital.com":5,"theartnewspaper.com":5,
  "wikipedia.org":5,"ammoniaenergy.org":5,
  // T6 — analysis / advisory / law firm / NGO / commercial
  "wfw.com":6,"lw.com":6,"allbrightlaw.com":6,"klalaw.com.br":6,"nortonrosefulbright.com":6,"reedsmith.com":6,"dlapiper.com":6,"kpmg-law.de":6,
  "debrauw.com":6,"pwc.com":6,"deloitte.com":6,"amundi.com":6,"mckinsey.com":6,"natlawreview.com":6,"legalclarity.org":6,"chambers.com":6,
  "fenechlaw.com":6,"coolset.com":6,"planbe.eco":6,"complymarket.com":6,"carboneer.earth":6,"senken.io":6,"shipzero.com":6,"cim.io":6,
  "climatecatalyst.org":6,"clientearth.asia":6,"igsd.org":6,"envigilance.com":6,"sustainable-ships.org":6,"heavyvehicleinspection.com":6,
  "epcadvisor.co.uk":6,"easyepc.org":6,"home-energy-model.co.uk":6,"britanniapandi.com":6,"skuld.com":6,"reach24h.com":6,"normecverifavia.com":6,
  "customtruck.com":6,"qtagg.com":6,"enpg.com":6,"carbon-direct.com":6,"climatepartner.com":6,"ups.com":6,"searoutes.com":6,"accelerator.nyc":6,
  "futureforwarding.com":6,"varuna-sentinels.com":6,"ecosistant.eu":6,"investbangladesh.co":6,"impactbuying.com":6,"dockflow.com":6,"cfp.energy":6,
  "govtech.com":6,"simplybusiness.co.uk":6,"onewaybit.com":6,"lindnerlogistics.com":6,"feedlegislation.org":6,"nautilusint.org":6,"maloneyaffordable.com":6,"promiseenergy.com":6,
};
// heuristic fallback for the long tail (non-flip, exempt) — by TLD/keyword
function heuristic(key, name="") {
  const s = (key + " " + name).toLowerCase();
  if (/\.gov$|\.gov\.|\bgov\b|legislature|parliament|\.go\.|regjeringen|ministerio|ministry|customs|\.govt\./.test(s)) return { t: 2, c: "heuristic-gov" };
  if (/\.eu$|europa\.eu|\.int$|oecd|\bun\b|unep|unfccc|world ?bank|intergov/.test(s)) return { t: 3, c: "heuristic-igov" };
  if (/\.ac\.|\.edu$|university|institute|research|\.uni-/.test(s)) return { t: 3, c: "heuristic-academic" };
  if (/association|federation|council|\bbody\b|standards|chamber|alliance/.test(s)) return { t: 4, c: "heuristic-industry" };
  if (/news|press|magazine|times|journal|insider|media|daily/.test(s)) return { t: 5, c: "heuristic-press" };
  if (/law|legal|advisor|consult|kpmg|deloitte|pwc|partners/.test(s)) return { t: 6, c: "heuristic-advisory" };
  return { t: 6, c: "heuristic-default-T6" };
}

const RATIFY = new Set(["ec.europa.eu","eur-lex.europa.eu","imo.org","icao.int","parliament.uk","gao.gov","ers.usda.gov","eia.gov","iea.org","oecd.org","worldbank.org","wto.org","unctad.org","lr.org","dnv.com","classnk.or.jp","bureauveritas.com","icapcarbonaction.com","iso.org","iata.org","portoflosangeles.org"]);

const arr = JSON.parse(readFileSync(resolve(D, "institutions.json"), "utf8"));
const tierFor = new Map();
let curated = 0, heur = 0;
const sheet = [];
for (const e of arr) {
  let t, c;
  if (MAP[e.key] != null) { t = MAP[e.key]; c = "curated"; curated++; }
  else { const h = heuristic(e.key, e.name); t = h.t; c = h.c; heur++; }
  tierFor.set(e.key, t);
  sheet.push({ ...e, proposedTier: t, basis: c, ratify: RATIFY.has(e.key) });
}

// ── re-run Option-B flip simulation on PROPOSED canonical tiers ──
const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority,is_archived");
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const itemById = new Map(items.map((i) => [i.id, i]));
const searchById = new Map(searches.map((r) => [r.id, r]));
const flipRegs = new Set(), passReg = new Set();
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived || !HIGH.has(it.priority) || !REG_TYPES.has(it.item_type)) continue;
  const sr = searchById.get(c.search_result_id); const k = institution(hostOf(sr?.result_url || ""));
  const t = tierFor.get(k);
  const key = it.legacy_id || it.id.slice(0, 8);
  if (t === 1 || t === 2) passReg.add(key); else flipRegs.add(key);
}

// write the full sheet
const md = ["# PHASE 0' canonical institutional tier sheet (PROPOSED — for ratification)", "",
  `institutions: ${arr.length} | curated: ${curated} | heuristic: ${heur}`, "",
  "| institution | proposed | basis | regHigh | rows | curTiers | ratify |", "|---|---|---|---|---|---|---|",
  ...sheet.sort((a,b)=>b.regHighClaims-a.regHighClaims || b.factClaims-a.factClaims)
    .map(e=>`| ${e.key} | T${e.proposedTier} | ${e.basis} | ${e.regHighClaims} | ${e.srcRows} | ${e.tiers.join(",")||"-"} | ${e.ratify?"★":""} |`)].join("\n");
writeFileSync(resolve(D, "tier-sheet.md"), md);

console.log(`=== PHASE 0' PROPOSED canonical tiers: ${curated} curated + ${heur} heuristic = ${arr.length} institutions ===`);
console.log(`sheet written: scripts/_diag/tier-sheet.md`);
console.log(`\n=== PROPOSED Option-B flip set (canonical tiers) ===`);
console.log(`reg items FLIP: ${flipRegs.size}  (pre-canon arbitrary-resolver showed 30-32)`);
console.log([...flipRegs].sort().join(", "));
console.log(`\n=== RATIFICATION SUBSET (★ — contested ≤2-vs-≥3 boundary + named) ===`);
console.log(`${"institution".padEnd(26)} prop  regHigh  curTiers   note`);
for (const e of sheet.filter(x=>x.ratify).sort((a,b)=>b.regHighClaims-a.regHighClaims))
  console.log(`${e.key.padEnd(26)} T${e.proposedTier}   ${String(e.regHighClaims).padStart(5)}   [${(e.tiers.join(",")||"-").padEnd(7)}]  ${(e.name||"").slice(0,34)}`);
process.exit(0);
