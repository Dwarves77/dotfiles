/** P0-1 flags 5 + 6: per-item x real-tier crosstab for the F1 blast radius, plus the T7 sub-analysis.
 *  GOVERNING: remediation-discipline + source-credibility-model (tier semantics).
 *
 *  Flag 5: for every live CRITICAL/HIGH item carrying >=1 FACT claim whose real source tier > 2,
 *          print the item x tier(3..7) matrix. Tests A's "17 non-reg stay verified" claim and is the
 *          core input to the deferred non-reg authority-floor spec pass.
 *  Flag 6: T7 = weight 0 in the trust model (source-credibility-model S4). A CRITICAL/HIGH FACT
 *          grounded in a T7 source is certified on a zero-authority source — contradicts the model.
 *          Report that blast radius separately (do NOT bundle into the floor change).
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
const realTierOf = (s) => (s == null ? null : (s.effective_tier ?? s.base_tier ?? null));

const items   = await readAll("intelligence_items", "id,legacy_id,title,item_type,priority,provenance_status,is_archived,source_id");
const sources = await readAll("sources", "id,url,name,base_tier,effective_tier");
const claims  = await readAll("section_claim_provenance", "id,intelligence_item_id,claim_kind,source_id,search_result_id");
const searches = await readAll("agent_run_searches", "id,result_url");

const itemById  = new Map(items.map((i) => [i.id, i]));
const srcById   = new Map(sources.map((s) => [s.id, s]));
const srcByHost = new Map(); for (const s of sources) { const h = hostOf(s.url); if (h && !srcByHost.has(h)) srcByHost.set(h, s); }
const searchById = new Map(searches.map((r) => [r.id, r]));

function resolveSource(c) {
  if (c.source_id && srcById.has(c.source_id)) { const s = srcById.get(c.source_id); if (realTierOf(s) != null) return s; }
  if (c.search_result_id && searchById.has(c.search_result_id)) {
    const h = hostOf(searchById.get(c.search_result_id).result_url);
    if (h && srcByHost.has(h)) return srcByHost.get(h);
  }
  return null;
}

// per-item tier counts (real tier > 2 only — the floor-failing set)
const rows = new Map();   // itemId -> { item, tiers:{3..7:n}, total }
const t7sources = new Map(); // sourceName -> count (which T7 sources are doing the grounding)
for (const c of claims) {
  if (c.claim_kind !== "FACT") continue;
  const it = itemById.get(c.intelligence_item_id);
  if (!it || it.is_archived || !HIGH.has(it.priority)) continue;
  const s = resolveSource(c);
  const t = realTierOf(s);
  if (t == null || t <= 2) continue;   // passes floor / unresolved handled elsewhere
  const r = rows.get(it.id) || { item: it, tiers: {}, total: 0 };
  r.tiers[t] = (r.tiers[t] || 0) + 1; r.total++;
  rows.set(it.id, r);
  if (t === 7 && s) t7sources.set(s.name || hostOf(s.url) || s.id, (t7sources.get(s.name || hostOf(s.url) || s.id) || 0) + 1);
}

const arr = [...rows.values()].sort((a, b) => b.total - a.total);
console.log(`=== FLAG 5: per-item x real-tier crosstab (CRITICAL/HIGH FACT claims, real tier > 2) ===`);
console.log(`${"item".padEnd(14)} ${"type".padEnd(15)} ${"t3 t4 t5 t6 t7".padStart(15)}  tot  floor?  title`);
for (const r of arr) {
  const it = r.item;
  const cells = [3, 4, 5, 6, 7].map((t) => String(r.tiers[t] || 0).padStart(2)).join(" ");
  const isReg = REG_TYPES.has(it.item_type);
  const verdict = isReg ? "FAIL " : "exempt";   // under Option B
  console.log(`${(it.legacy_id || it.id.slice(0, 8)).padEnd(14)} ${(it.item_type || "").padEnd(15)} ${cells}  ${String(r.total).padStart(3)}  ${verdict}  ${(it.title || "").slice(0, 38)}`);
}

const regRows = arr.filter((r) => REG_TYPES.has(r.item.item_type));
const nonRegRows = arr.filter((r) => !REG_TYPES.has(r.item.item_type));
console.log(`\nOption B outcome: ${regRows.length} regulatory items FAIL (flip to quarantined) | ${nonRegRows.length} non-reg items EXEMPT (stay verified)`);
console.log(`  regulatory (flip):`, regRows.map((r) => r.item.legacy_id || r.item.id.slice(0, 8)).join(", "));

console.log(`\n=== FLAG 6: T7 (zero-weight) sub-analysis ===`);
const t7Claims = arr.reduce((n, r) => n + (r.tiers[7] || 0), 0);
const itemsAnyT7 = arr.filter((r) => r.tiers[7]);
const itemsSoleT7 = arr.filter((r) => r.tiers[7] && r.total === r.tiers[7]); // every floor-failing FACT is T7
console.log(`CRITICAL/HIGH FACT claims grounded in a T7 (weight-0) source: ${t7Claims}`);
console.log(`items with >=1 T7-grounded CRITICAL/HIGH FACT:               ${itemsAnyT7.length}`);
console.log(`items whose floor-failing FACTs are SOLELY T7:               ${itemsSoleT7.length}`);
console.log(`  any-T7 items:`, itemsAnyT7.map((r) => `${r.item.legacy_id || r.item.id.slice(0, 8)}(${r.tiers[7]})`).join(", "));
console.log(`T7 sources doing the grounding (name -> #claims):`);
for (const [n, c] of [...t7sources.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}  ${n}`);
process.exit(0);
