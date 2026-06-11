/** P0-1 correction 7 (read-only): registry sources at T7/default tier, esp. bulk register-as-source
 *  entrants. GOVERNING: remediation-discipline + source-credibility-model.
 *  If the bulk register-as-source path (db.mjs registerSource: base_tier ?? 7, name ?? host,
 *  status active) skipped classification, those sources sit at T7 and any FACT claim they ground is
 *  latently mis-tiered. Quantify: how many T7 sources exist, how many look bulk-registered
 *  (never classification_assigned), and how many actually GROUND >=1 FACT claim span. PURE READS.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const tierOf = (s) => (s.effective_tier ?? s.base_tier ?? null);

const sources = await readAll("sources", "id,url,name,base_tier,effective_tier,status,classification_assigned_at,classification_confidence,source_role,tier_at_creation,created_at");
const claims  = await readAll("section_claim_provenance", "id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const searchById = new Map(searches.map((r) => [r.id, r]));

// which hosts actually ground a FACT span (via search_result_id row)
const groundingHostCount = {};
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const r = searchById.get(c.search_result_id); if (!r) continue;
  const h = hostOf(r.result_url); if (h) groundingHostCount[h] = (groundingHostCount[h] || 0) + 1;
}

const t7 = sources.filter((s) => tierOf(s) === 7);
const t7NeverClassified = t7.filter((s) => !s.classification_assigned_at);
const t7NameIsHost = t7.filter((s) => (s.name || "").toLowerCase() === hostOf(s.url));
const t7Grounding = t7.map((s) => ({ s, n: groundingHostCount[hostOf(s.url)] || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
const t7GroundClaims = t7Grounding.reduce((n, x) => n + x.n, 0);

console.log(`=== correction 7: T7 / default-tier registry sources ===`);
console.log(`total sources:                                ${sources.length}`);
console.log(`sources at effective/base tier 7:             ${t7.length}`);
console.log(`  of which never classification_assigned:     ${t7NeverClassified.length}  (likely bulk register-as-source)`);
console.log(`  of which name == url host (auto-named):      ${t7NameIsHost.length}`);
console.log(`T7 sources that GROUND >=1 FACT claim:         ${t7Grounding.length}  (${t7GroundClaims} FACT claims latently mis-tiered)`);
console.log(`\nT7 sources doing grounding (claims | classified? | name):`);
for (const { s, n } of t7Grounding.slice(0, 30))
  console.log(`  ${String(n).padStart(3)}  ${(s.classification_assigned_at ? "classified" : "NEVER-CLASS").padEnd(12)} ${(s.name || "").slice(0, 40).padEnd(40)} ${hostOf(s.url)}`);
if (t7Grounding.length > 30) console.log(`  ... +${t7Grounding.length - 30} more`);

// adjacency: status breakdown of bulk-looking T7
const byStatus = {};
for (const s of t7NeverClassified) byStatus[s.status || "null"] = (byStatus[s.status || "null"] || 0) + 1;
console.log(`\nnever-classified T7 by status:`, JSON.stringify(byStatus));
process.exit(0);
