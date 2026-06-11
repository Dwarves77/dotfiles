/** P0-1 (F1 FAKE CERTIFICATION) read-only probe. GOVERNING: remediation-discipline.
 *
 * groundBrief stamps source_tier_at_grounding=2 hardcoded on EVERY FACT claim
 * (canonical-pipeline.ts: `source_tier_at_grounding: c2.claim_kind === "FACT" ? 2 : null`).
 * validate_item_provenance criterion 3 (migration 119) only enforces the authority floor on
 * CRITICAL/HIGH items: `source_tier_at_grounding IN (1,2)`. Because the stamp is a constant 2,
 * the floor PASSES BY CONSTRUCTION for every FACT claim — the certification is fake.
 *
 * This probe resolves each FACT claim's REAL source tier (the value the floor SHOULD have seen):
 *   1. source_id            -> sources.effective_tier (COALESCE base_tier)   [primary path]
 *   2. search_result_id     -> agent_run_searches.result_url host -> sources.url host -> tier
 * and counts, among CRITICAL/HIGH items (where the floor bites), how many FACT claims would FAIL
 * the real floor: real tier is UNKNOWN (unresolvable) or > 2. That count is the blast radius —
 * claims currently certified that the honest floor would reject.
 *
 * PURE READS. Paginated (readAll) throughout — never .in(<ids>) which truncates at 1000.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const HIGH = new Set(["CRITICAL", "HIGH"]);
const passesFloor = (t) => t === 1 || t === 2;            // the gate's IN (1,2)
const realTierOf = (s) => (s == null ? null : (s.effective_tier ?? s.base_tier ?? null));

// ── load corpus (paginated) ───────────────────────────────────────────
const items   = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,is_archived");
const sources = await readAll("sources", "id,url,base_tier,effective_tier,status");
const claims  = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_id,search_result_id,source_tier_at_grounding");
const searches = await readAll("agent_run_searches", "id,result_url");

const itemById   = new Map(items.map((i) => [i.id, i]));
const srcById    = new Map(sources.map((s) => [s.id, s]));
const srcByHost  = new Map(); for (const s of sources) { const h = hostOf(s.url); if (h && !srcByHost.has(h)) srcByHost.set(h, s); }
const searchById = new Map(searches.map((r) => [r.id, r]));

console.log(`rows: items=${items.length} sources=${sources.length} claim_rows=${claims.length} search_rows=${searches.length}`);

// resolve a FACT claim's real source tier via the two documented paths
function resolveRealTier(c) {
  if (c.source_id && srcById.has(c.source_id)) {
    const t = realTierOf(srcById.get(c.source_id));
    if (t != null) return { tier: t, via: "source_id" };
  }
  if (c.search_result_id && searchById.has(c.search_result_id)) {
    const h = hostOf(searchById.get(c.search_result_id).result_url);
    if (h && srcByHost.has(h)) {
      const t = realTierOf(srcByHost.get(h));
      if (t != null) return { tier: t, via: "search_host" };
    }
  }
  return { tier: null, via: "unresolved" };
}

// ── walk FACT claims on live CRITICAL/HIGH items (where the floor applies) ──
const factClaims = claims.filter((c) => c.claim_kind === "FACT");
let highFact = 0, falselyCertified = 0;
const byReason = { unresolved: 0, tier_gt_2: 0 };
const tierHist = {};                 // real-tier distribution of falsely-certified claims
const typeHist = {};                 // item_type of affected items (counted once per item)
const byStatus = {};                 // blast radius split by item provenance_status
const affectedItems = new Map();     // itemId -> {item, bad, total}
const stampCheck = { not2: 0 };      // sanity: confirm the hardcoded-2 hypothesis

for (const c of factClaims) {
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived) continue;
  if (c.source_tier_at_grounding !== 2) stampCheck.not2++;
  if (!HIGH.has(it.priority)) continue;
  highFact++;
  const { tier } = resolveRealTier(c);
  const a = affectedItems.get(it.id) || { item: it, bad: 0, total: 0 };
  a.total++;
  if (!passesFloor(tier)) {
    falselyCertified++;
    a.bad++;
    if (tier == null) byReason.unresolved++; else byReason.tier_gt_2++;
    const tk = tier == null ? "null" : String(tier);
    tierHist[tk] = (tierHist[tk] || 0) + 1;
    const st = it.provenance_status || "null";
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  affectedItems.set(it.id, a);
}

const affected = [...affectedItems.values()].filter((a) => a.bad > 0);
const affectedVerified = affected.filter((a) => a.item.provenance_status === "verified");
for (const a of affected) { const t = a.item.item_type || "null"; typeHist[t] = (typeHist[t] || 0) + 1; }

console.log(`\n=== F1 BLAST RADIUS (CRITICAL/HIGH items, live) ===`);
console.log(`stamp sanity: FACT claims with source_tier_at_grounding != 2 across ALL items: ${stampCheck.not2} (expect ~0 if hardcoded-2 holds)`);
console.log(`CRITICAL/HIGH FACT claims (floor applies):      ${highFact}`);
console.log(`  -> would FAIL real floor (unknown or tier>2): ${falselyCertified}`);
console.log(`       reason unresolved (no tier):             ${byReason.unresolved}`);
console.log(`       reason real tier > 2:                    ${byReason.tier_gt_2}`);
console.log(`items affected (>=1 falsely-certified FACT):    ${affected.length}`);
console.log(`  of which currently provenance_status=verified: ${affectedVerified.length}  <- these flip to quarantined under the honest floor`);
console.log(`falsely-certified claims by item status:`, JSON.stringify(byStatus));
console.log(`real-tier histogram of falsely-certified claims:`, JSON.stringify(tierHist));
console.log(`item_type of affected items (once per item):`, JSON.stringify(typeHist));

console.log(`\n=== affected VERIFIED items (the real regression surface) ===`);
for (const a of affectedVerified.sort((x, y) => y.bad - x.bad).slice(0, 40))
  console.log(`  ${(a.item.legacy_id || a.item.id.slice(0, 8)).padEnd(14)} bad=${String(a.bad).padStart(3)}/${String(a.total).padStart(3)}  ${(a.item.title || "").slice(0, 46)}`);
if (affectedVerified.length > 40) console.log(`  ... +${affectedVerified.length - 40} more`);
process.exit(0);
