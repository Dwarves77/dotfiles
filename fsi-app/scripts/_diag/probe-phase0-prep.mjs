/** P0-1 PHASE 0 write-input prep (read-only). Gathers exactly what the guarded execute script needs:
 *  (a) a representative result_url per authoritative host to register, (b) the 13 T7 source rows
 *  (ids + current tier/classification state), (c) the duplicate CSRF rows for dedupe. PURE READS. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

const AUTH = ["gao.gov","questions-statements.parliament.uk","english.www.gov.cn","sos.state.tx.us","governor.nc.gov","mof.go.jp","cssf.lu","dehst.de","osc.ny.gov","business.gov.uk","whc.unesco.org"];
const T7_HOSTS = ["nlr.gov","maritimecarbonintelligence.com","cranfield.ac.uk","sei.org","csrf.ac.uk","wri.org","iml.fraunhofer.de","tandfonline.com","erim.eur.nl","tyndall.ac.uk","sustainable.mit.edu"];

const sources = await readAll("sources", "id,url,name,base_tier,effective_tier,tier,status,classification_assigned_at,classification_confidence,independent_citers,total_citations,last_intelligence_item_at,created_at");
const searches = await readAll("agent_run_searches", "id,result_url,result_title");

// (a) representative URL per AUTH host
console.log("=== (a) AUTHORITATIVE hosts -> representative URL (for registration) ===");
for (const h of AUTH) {
  const hit = searches.find((s) => hostOf(s.result_url) === h);
  console.log(`${h.padEnd(38)} ${hit ? hit.result_url : "(no url found)"}`);
}
// (b) T7 source rows
console.log("\n=== (b) T7 sources to re-tier (id | base/eff/tier | classified? | cites | name) ===");
const t7rows = sources.filter((s) => T7_HOSTS.includes(hostOf(s.url)));
for (const s of t7rows)
  console.log(`${s.id}  b=${s.base_tier} e=${s.effective_tier ?? "-"} t=${s.tier ?? "-"}  ${(s.classification_assigned_at?"Y":"N")}  cit=${s.total_citations ?? 0}/${s.independent_citers ?? 0}  ${hostOf(s.url).padEnd(34)} ${s.name}`);

// (c) duplicates among the T7 hosts (and generally check CSRF)
console.log("\n=== (c) duplicate-host groups within T7 set (dedupe targets) ===");
const byHost = {};
for (const s of t7rows) { const h = hostOf(s.url); (byHost[h] ||= []).push(s); }
for (const [h, rows] of Object.entries(byHost)) if (rows.length > 1) {
  console.log(`HOST ${h} has ${rows.length} rows:`);
  for (const s of rows) console.log(`   id=${s.id} url=${s.url} name="${s.name}" cit=${s.total_citations ?? 0} created=${s.created_at} lastItem=${s.last_intelligence_item_at ?? "-"}`);
}
process.exit(0);
