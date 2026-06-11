/** Does the duplicate-source-row / inconsistent-tier defect affect the REG flip count, or only
 *  non-reg/credibility? For each CRITICAL/HIGH FACT claim on a REGULATORY item, check if its span
 *  host is one of the duplicate-tier hosts; if so the resolved tier is unstable. Report reg exposure.
 *  Also: full scan for ALL registered hosts that have >1 source row at DIFFERENT tiers (class size).
 *  PURE READS. GOVERNING: remediation-discipline + source-credibility-model. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const tierOf = (s) => (s.effective_tier ?? s.base_tier ?? null);

const items = await readAll("intelligence_items", "id,legacy_id,item_type,priority,is_archived");
const sources = await readAll("sources", "id,url,base_tier,effective_tier,status");
const claims = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");
const itemById = new Map(items.map((i) => [i.id, i]));
const searchById = new Map(searches.map((r) => [r.id, r]));

// hosts with >1 source row at DIFFERENT tiers (the class)
const byHost = {};
for (const s of sources) { const h = hostOf(s.url); if (!h) continue; (byHost[h] ||= []).push(tierOf(s)); }
const inconsistent = new Set();
for (const [h, tiers] of Object.entries(byHost)) { const uniq = new Set(tiers); if (tiers.length > 1 && uniq.size > 1) inconsistent.add(h); }
console.log(`registered hosts with >1 row at INCONSISTENT tiers (the class): ${inconsistent.size}`);
console.log([...inconsistent].sort().join(", "));

// reg-item exposure: CRITICAL/HIGH reg FACT claims whose span host is inconsistent-tier
let regClaims = 0, regExposed = 0;
const exposedRegItems = new Map();
for (const c of claims) {
  if (c.claim_kind !== "FACT" || !c.search_result_id) continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived || !HIGH.has(it.priority) || !REG_TYPES.has(it.item_type)) continue;
  regClaims++;
  const sr = searchById.get(c.search_result_id); if (!sr) continue;
  const h = hostOf(sr.result_url);
  if (inconsistent.has(h)) { regExposed++; const k = it.legacy_id || it.id.slice(0,8); exposedRegItems.set(k, (exposedRegItems.get(k)||0)+1); }
}
console.log(`\nCRITICAL/HIGH REG FACT claims: ${regClaims}  | spanning an inconsistent-tier host: ${regExposed}`);
console.log(`reg items whose flip status could shift after dedupe (host:claims):`);
console.log([...exposedRegItems.entries()].map(([k,n])=>`${k}(${n})`).join(", ") || "  NONE — reg flip count is STABLE under dedupe");
process.exit(0);
