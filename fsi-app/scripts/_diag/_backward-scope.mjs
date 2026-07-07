// READ-ONLY backward-batch scoping (no writes, no spend). Measures the unified-operation buckets +
// their OVERLAP + a re-ground cost estimate for reg-family items, so the backward pass is quoted as
// ONE staged operation (same items, one root cause: FACTs grounded on non-authoritative sources),
// not five parallel cascades. Buckets: portal re-point · multi-instrument (CBAM-class proxy) ·
// pool-host registration (the 1034 NULL-stamp items) · re-ground · already-quarantined.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(ROOT + "/.env.local");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const ENACTED_HOST = /(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)/i;
const ENACTED_DOC = /celex[:%]?3?\d{4}[rl]|celex.{0,8}:.{0,8}3\d{4}|\/eli\/(reg|dir)\/\d{4}\/\d|legal-content.{0,60}celex/i;
const REG_FLOOR = 2; // reg-family FACT authority floor (<=T2)

const items = (await all("intelligence_items", "id,title,item_type,source_url,provenance_status,is_archived")).filter((r) => REG.has(r.item_type) && !r.is_archived);
const byId = new Map(items.map((r) => [r.id, r]));
const sources = await all("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const searches = await all("agent_run_searches", "id,result_url,intelligence_item_id");
const searchById = new Map(searches.map((r) => [r.id, r]));
const poolByItem = new Map();
for (const s of searches) { if (!byId.has(s.intelligence_item_id)) continue; (poolByItem.get(s.intelligence_item_id) || poolByItem.set(s.intelligence_item_id, []).get(s.intelligence_item_id)).push(s.result_url || ""); }
const claims = (await all("section_claim_provenance", "intelligence_item_id,claim_kind,search_result_id")).filter((c) => c.claim_kind === "FACT" && byId.has(c.intelligence_item_id));
const factsByItem = new Map();
for (const c of claims) { (factsByItem.get(c.intelligence_item_id) || factsByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c); }

const B = { portal: new Set(), multi: new Set(), nullhost: new Set(), subfloor: new Set(), quarantined: new Set(), reground: new Set() };
for (const it of items) {
  const pool = poolByItem.get(it.id) || [];
  const srcEnacted = ENACTED_HOST.test(it.source_url || "");
  const poolEnacted = pool.some((u) => ENACTED_DOC.test(u) || (ENACTED_HOST.test(u) && /celex|\/eli\//i.test(u)));
  if (!srcEnacted && poolEnacted) B.portal.add(it.id);
  const facts = factsByItem.get(it.id) || [];
  let nNull = 0, nSub = 0;
  for (const c of facts) { const sr = c.search_result_id ? searchById.get(c.search_result_id) : null; if (!sr) continue; const { tier } = resolver.resolveSpan(sr.result_url); if (tier == null) nNull++; else if (tier > REG_FLOOR) nSub++; }
  if (nNull > 0) B.nullhost.add(it.id);
  if (nSub > 0) B.subfloor.add(it.id);
  if (it.provenance_status === "quarantined") B.quarantined.add(it.id);
  // CBAM-class proxy: base is enacted (T1 primary) yet some FACTs are NULL/sub-floor -> amendment facts on a tracker.
  if (srcEnacted && (nNull > 0 || nSub > 0)) B.multi.add(it.id);
  if (B.portal.has(it.id) || nNull > 0 || nSub > 0 || it.provenance_status === "quarantined") B.reground.add(it.id);
}

const card = (s) => s.size;
const inter = (a, b) => [...a].filter((x) => b.has(x)).length;
console.log(`REG-FAMILY active: ${items.length}\n`);
console.log(`=== BUCKETS (item counts) ===`);
console.log(`  B1 portal re-point (portal source + enacted URL in pool) : ${card(B.portal)}`);
console.log(`  B2 multi-instrument CBAM-class (enacted base + null/sub-floor facts, A/B-dependent) : ${card(B.multi)}`);
console.log(`  B3 pool-host registration (>=1 NULL-stamped FACT)        : ${card(B.nullhost)}`);
console.log(`  B3b sub-floor-already-resolved (>=1 FACT tier > ${REG_FLOOR})    : ${card(B.subfloor)}`);
console.log(`  B4 already quarantined                                   : ${card(B.quarantined)}`);
console.log(`  UNION needing re-ground (B1 | null | sub-floor | quar)   : ${card(B.reground)}`);
console.log(`\n=== OVERLAP (the efficiency point — same items, one root cause) ===`);
console.log(`  portal ∩ nullhost        : ${inter(B.portal, B.nullhost)}`);
console.log(`  portal ∩ quarantined     : ${inter(B.portal, B.quarantined)}`);
console.log(`  nullhost ∩ quarantined   : ${inter(B.nullhost, B.quarantined)}`);
console.log(`  multi ∩ nullhost         : ${inter(B.multi, B.nullhost)}`);
console.log(`  portal ∩ multi           : ${inter(B.portal, B.multi)}`);
const sumBuckets = card(B.portal) + card(B.nullhost) + card(B.quarantined);
console.log(`  naive sum (portal+nullhost+quarantined) = ${sumBuckets}  vs  UNION reground = ${card(B.reground)}  -> overlap saves ${sumBuckets - card(B.reground)} re-grounds`);
console.log(`\n=== COST (re-ground = the only real spend; fetch is free on legal hosts) ===`);
console.log(`  union items to re-ground: ${card(B.reground)}  @ ~$1.00-1.50/item  =  ~$${(card(B.reground) * 1).toFixed(0)}-${(card(B.reground) * 1.5).toFixed(0)}`);
console.log(`\n(quarantine-disposition deferred backlog from the lane: 76 live-quarantined, 73 deferred, 1 resurrected, 62 re-fire <=7d — overlaps B4)`);
process.exit(0);
