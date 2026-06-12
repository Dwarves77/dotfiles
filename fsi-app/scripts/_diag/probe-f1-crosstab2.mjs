/** P0-1 correction 5: CORRECTED corpus-wide crosstab. GOVERNING: remediation-discipline.
 *
 *  Resolver INVERTS per Jason's correction 1: the honest source of a FACT claim is the pool row that
 *  CONTAINS ITS SPAN (search_result_id), NOT the hardcoded primary source_id. So:
 *    1. search_result_id -> agent_run_searches.result_url -> host -> sources host -> tier   [PRIMARY]
 *    2. source_id -> sources.effective_tier                                                  [last resort]
 *    3. unresolved
 *  Runs over ALL CRITICAL/HIGH FACT claims corpus-wide. The flip set is PROVISIONAL and may grow
 *  beyond the 3 regs: claims spanned from secondary corroborators on t1-primary items now surface.
 *  PURE READS, paginated.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL", "HIGH"]);
const REG_TYPES = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const tierOf = (s) => (s == null ? null : (s.effective_tier ?? s.base_tier ?? null));
const passesFloor = (t) => t === 1 || t === 2;

const items   = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,is_archived");
const sources = await readAll("sources", "id,url,name,base_tier,effective_tier");
const claims  = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_id,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");

const itemById   = new Map(items.map((i) => [i.id, i]));
const srcById    = new Map(sources.map((s) => [s.id, s]));
const srcByHost  = new Map(); for (const s of sources) { const h = hostOf(s.url); if (h && !srcByHost.has(h)) srcByHost.set(h, s); }
const searchById = new Map(searches.map((r) => [r.id, r]));

// INVERTED resolver — span-containing pool row first, source_id last resort.
function resolve_(c) {
  if (c.search_result_id && searchById.has(c.search_result_id)) {
    const h = hostOf(searchById.get(c.search_result_id).result_url);
    if (h && srcByHost.has(h)) { const t = tierOf(srcByHost.get(h)); if (t != null) return { tier: t, via: "span_host" }; }
    if (h) return { tier: null, via: `span_host_unregistered:${h}` };
  }
  if (c.source_id && srcById.has(c.source_id)) { const t = tierOf(srcById.get(c.source_id)); if (t != null) return { tier: t, via: "source_id_fallback" }; }
  return { tier: null, via: "unresolved" };
}

const fact = claims.filter((c) => c.claim_kind === "FACT");
let highFact = 0, fail = 0;
const via = {}, tierHist = {}, rows = new Map();
const unregHosts = {};
for (const c of fact) {
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived || !HIGH.has(it.priority)) continue;
  highFact++;
  const { tier, via: v } = resolve_(c);
  via[v.split(":")[0]] = (via[v.split(":")[0]] || 0) + 1;
  if (v.startsWith("span_host_unregistered")) { const h = v.split(":")[1]; unregHosts[h] = (unregHosts[h] || 0) + 1; }
  if (!passesFloor(tier)) {
    fail++;
    const tk = tier == null ? "null" : String(tier);
    tierHist[tk] = (tierHist[tk] || 0) + 1;
    const r = rows.get(it.id) || { item: it, tiers: {}, total: 0 };
    r.tiers[tk] = (r.tiers[tk] || 0) + 1; r.total++;
    rows.set(it.id, r);
  }
}

console.log(`=== CORRECTED corpus-wide F1 floor failure (inverted resolver) ===`);
console.log(`CRITICAL/HIGH FACT claims:                 ${highFact}`);
console.log(`  would FAIL real floor (tier>2 or null):  ${fail}`);
console.log(`  resolved-via breakdown:`, JSON.stringify(via));
console.log(`  failing-claim real-tier histogram:`, JSON.stringify(tierHist));
if (Object.keys(unregHosts).length) console.log(`  span hosts NOT in registry (-> NULL stamp, honestly fail):`, JSON.stringify(unregHosts));

const arr = [...rows.values()].sort((a, b) => b.total - a.total);
const regFail = arr.filter((r) => REG_TYPES.has(r.item.item_type));
const nonRegFail = arr.filter((r) => !REG_TYPES.has(r.item.item_type));
console.log(`\nitems with >=1 floor-failing FACT: ${arr.length}  (reg=${regFail.length} FLIP under Option B | non-reg=${nonRegFail.length} exempt)`);
console.log(`verified items that FLIP under Option B (reg types):`);
for (const r of regFail.sort((a,b)=>b.total-a.total)) {
  const t = Object.entries(r.tiers).map(([k,v])=>`t${k}:${v}`).join(" ");
  console.log(`  ${(r.item.legacy_id||r.item.id.slice(0,8)).padEnd(14)} ${String(r.item.provenance_status).padEnd(11)} ${t.padEnd(20)} ${(r.item.title||"").slice(0,40)}`);
}

console.log(`\n=== per-item crosstab — ALL floor-failing items (reg + non-reg) ===`);
console.log(`${"item".padEnd(14)} ${"type".padEnd(15)} tiers(fail-claims)        status      title`);
for (const r of arr) {
  const t = Object.entries(r.tiers).sort().map(([k,v])=>`t${k}:${v}`).join(" ");
  const flip = REG_TYPES.has(r.item.item_type) ? "FLIP" : "exempt";
  console.log(`  ${(r.item.legacy_id||r.item.id.slice(0,8)).padEnd(14)} ${(r.item.item_type||"").padEnd(15)} ${t.padEnd(24)} ${String(r.item.provenance_status).padEnd(10)} ${flip}  ${(r.item.title||"").slice(0,30)}`);
}
process.exit(0);
