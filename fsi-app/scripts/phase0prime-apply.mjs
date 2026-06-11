/** PHASE 0' APPLY — canonical institutional tier per host group. GOVERNING: source-credibility-model
 *  + remediation-discipline. DRY-RUN default; --apply commits via the guarded db.mjs path (snapshots).
 *
 *  Canonical tier = base_tier, ONE per institution (eTLD+1 with europa.eu / gov.uk / US-state subdomain
 *  exceptions). For every registered institution whose rows are inconsistent OR not at the canonical
 *  tier, set base_tier=effective_tier=canonical on all its rows (skipping rows with a deliberate
 *  tier_override — the explicit per-row override flag). Then register the authoritative T1-2
 *  UNREGISTERED flip-relevant institutions (gov/official) at canonical tier so their honest passes
 *  materialize; secondary unregistered hosts are LEFT unregistered (NULL stamp -> honest fail).
 *
 *  Ratified tiers (Jason 2026-06-11): ec.europa.eu=2, eur-lex=1, IMO=2, ICAO=2, class societies
 *  (LR/DNV/ClassNK/BV)=4 [precedent: delegated authority attaches to official acts not websites;
 *  client briefings = industry-body publishing -> labeled "Industry interpretation:" ANALYSIS, not
 *  FACT-grade for CRITICAL/HIGH regs], ICAP=3, intergovernmentals (IEA/OECD/WB/WTO/UNCTAD/EIA)=3,
 *  parliament.uk=2, gao.gov=2, ers.usda=3, ISO/IATA=4.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readAll, guardedUpdate, registerSource } from "./lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const NOW = new Date().toISOString();
const CITE = { skill: "source-credibility-model", reason: "Phase 0' canonical institutional tier (one tier per host group; ratified 2026-06-11)" };

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const TWO_LEVEL = new Set(["co.uk","gov.uk","ac.uk","org.uk","com.br","gov.br","org.br","co.jp","go.jp","or.jp","ne.jp","gov.cn","com.cn","edu.cn","org.cn","gov.au","com.au","edu.au","org.au","gov.in","co.in","org.in","nic.in","gov.sg","com.sg","go.kr","or.kr","re.kr","gob.mx","gov.co","gob.cl","gc.ca","go.id","gov.za","gov.hk","europa.eu","canada.ca","ca.gov","ny.gov","tx.us","state.tx.us","wa.gov","or.us","ne.gov","nj.gov","pa.gov","mass.gov","oregon.gov","nc.gov","ct.gov"]);
function institution(host) { if (!host) return ""; const h = host.replace(/^www\./, "").toLowerCase(); const p = h.split("."); if (p.length <= 2) return h; const lt = p.slice(-2).join("."); return TWO_LEVEL.has(lt) ? p.slice(-3).join(".") : p.slice(-2).join("."); }

// curated tier map (same as classify-institutions.mjs MAP) — load from the committed source of truth
const { MAP } = await import("./_diag/tier-map.mjs");
function heuristic(key, name = "") { const s = (key + " " + name).toLowerCase();
  if (/\.gov$|\.gov\.|\bgov\b|legislature|parliament|\.go\.|regjeringen|ministerio|ministry|customs|\.govt\./.test(s)) return 2;
  if (/\.eu$|europa\.eu|\.int$|oecd|\bun\b|unep|unfccc|world ?bank|intergov/.test(s)) return 3;
  if (/\.ac\.|\.edu$|university|institute|research|\.uni-/.test(s)) return 3;
  if (/association|federation|council|\bbody\b|standards|chamber|alliance/.test(s)) return 4;
  if (/news|press|magazine|times|journal|insider|media|daily/.test(s)) return 5;
  if (/law|legal|advisor|consult|kpmg|deloitte|pwc|partners/.test(s)) return 6;
  return 6; }
const canonTier = (key, name) => (MAP[key] != null ? MAP[key] : heuristic(key, name));

// authoritative T1-2 UNREGISTERED flip-relevant institutions to register (host -> representative URL filled at runtime)
const REGISTER = { "gao.gov": 2, "state.tx.us": 2, "www.gov.cn": 2, "cssf.lu": 2, "dehst.de": 2, "governor.nc.gov": 2, "business.gov.uk": 2, "osc.ny.gov": 2, "lancaster.gov.uk": 2 };

const sources = await readAll("sources", "id,url,name,base_tier,effective_tier,tier_override,status");
const searches = await readAll("agent_run_searches", "id,result_url,result_title");

// group registered rows by institution
const inst = new Map();
for (const s of sources) { const k = institution(hostOf(s.url)); if (!k) continue; if (!inst.has(k)) inst.set(k, []); inst.get(k).push(s); }

console.log(`\n===== PHASE 0' APPLY (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`registered institutions: ${inst.size}`);

// 1. canonicalize tiers — only CURATED (ratified) or INCONSISTENT institutions. Consistent-uncurated
//    single-tier hosts are SKIPPED (already invariant-green; perfecting their tier is the institutions-
//    table follow-on — we never bake a heuristic guess onto an already-consistent host).
let instTouched = 0, rowsTouched = 0, overrideSkipped = 0, skippedConsistent = 0;
const heuristicInconsistent = [];
for (const [k, rows] of inst) {
  const live = rows.filter((r) => r.tier_override == null);
  overrideSkipped += rows.length - live.length;
  const inconsistent = new Set(live.map((r) => r.effective_tier ?? r.base_tier)).size > 1;
  const curated = MAP[k] != null;
  if (!curated && !inconsistent) { skippedConsistent++; continue; } // leave consistent-uncurated untouched
  const tier = curated ? MAP[k] : heuristic(k, rows[0]?.name || "");
  const targets = live.filter((r) => r.base_tier !== tier || (r.effective_tier != null && r.effective_tier !== tier));
  if (!targets.length) continue;
  const distinct = new Set(live.map((r) => r.effective_tier ?? r.base_tier));
  if (!curated && inconsistent) heuristicInconsistent.push(`${k}->T${tier}(${[...distinct].join(",")})`);
  instTouched++; rowsTouched += targets.length;
  if (APPLY) {
    await guardedUpdate("sources", (qb) => qb.in("id", targets.map((r) => r.id)),
      { base_tier: tier, effective_tier: tier, classification_assigned_at: NOW, classification_rationale: `Phase 0' canonical institutional tier T${tier} (${MAP[k] != null ? "ratified/curated" : "heuristic"})` },
      { cite: CITE });
  } else if (instTouched <= 40) {
    console.log(`  [tier] ${k.padEnd(34)} -> T${tier}  (${targets.length} rows; from {${[...distinct].join(",")}})`);
  }
}
console.log(`\nCANONICALIZE: ${instTouched} institutions, ${rowsTouched} rows ${APPLY ? "updated" : "would change"}; ${overrideSkipped} override-rows skipped; ${skippedConsistent} consistent-uncurated left untouched`);
if (heuristicInconsistent.length) console.log(`  ⚠ heuristic-tier on INCONSISTENT host (should be 0 — curate these): ${heuristicInconsistent.join("  ")}`);
else console.log(`  ✓ every inconsistent host is curated (no heuristic guesses applied)`);

// 2. register authoritative UNREGISTERED flip-relevant institutions
console.log(`\nREGISTER authoritative unregistered (T1-2):`);
for (const [host, tier] of Object.entries(REGISTER)) {
  const already = sources.find((s) => institution(hostOf(s.url)) === institution(host));
  if (already) { console.log(`  ${host.padEnd(28)} already registered (${already.id.slice(0,8)}) — skip`); continue; }
  const ex = searches.find((s) => hostOf(s.result_url) === host || institution(hostOf(s.result_url)) === institution(host));
  const url = ex ? ex.result_url : `https://${host}/`;
  if (APPLY) {
    const r = await registerSource({ url, name: ex?.result_title?.slice(0, 80) || host, base_tier: tier, extra: { tier_at_creation: tier, classification_assigned_at: NOW, classification_rationale: `Phase 0' authoritative registration T${tier} (ratified 2026-06-11)` } }, { cite: CITE });
    console.log(`  ${host.padEnd(28)} REGISTERED T${tier} ${r.created ? "(new)" : "(existing)"} ${r.source_id.slice(0,8)}`);
  } else {
    console.log(`  ${host.padEnd(28)} would register T${tier}  url=${url.slice(0, 60)}`);
  }
}

// 3. verify invariant (one tier per host) if applied
if (APPLY) {
  const after = await readAll("sources", "id,url,base_tier,tier_override");
  const byInst = new Map();
  for (const s of after) { if (s.tier_override != null) continue; const k = institution(hostOf(s.url)); if (!k) continue; if (!byInst.has(k)) byInst.set(k, new Set()); byInst.get(k).add(s.base_tier); }
  const bad = [...byInst.entries()].filter(([, t]) => t.size > 1);
  console.log(`\nINVARIANT CHECK (one base_tier per host, no override): ${bad.length === 0 ? "GREEN ✓" : `FAIL (${bad.length} multi-tier hosts: ${bad.slice(0,10).map(([k])=>k).join(", ")})`}`);
}
console.log(APPLY ? "\nAPPLIED." : "\nDRY-RUN — pass --apply to commit.");
process.exit(0);
