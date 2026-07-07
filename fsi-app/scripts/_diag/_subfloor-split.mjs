// READ-ONLY corpus-wide sub-floor diagnosis (no spend, no fetch). For every reg-family item with
// sub-floor (T>floor) FACT claims, classify each sub-floor fact's re-ground PATH:
//   INTERNAL  — the fact's span is ALREADY in one of the item's T1/T2 pool sources  -> groundBrief alone (~free)
//   ABSENT    — span not in any authoritative pool source  -> regenerate-relabel (contextual/forward facts
//               sourced to analysis, no enacted source needed) OR targeted-fetch (a missing enacted instrument)
// Item-level path = INTERNAL only if ALL its sub-floor facts are internal; else ABSENT (regenerate/fetch).
// CBAM-class (source already enacted but sub-floor facts present) is flagged — the multi-instrument set.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c) => { const o = []; for (let f = 0; ; f += 1000) { const { data } = await sb.from(t).select(c).order("id").range(f, f + 999); if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };
const ENACTED_HOST = /(eur-lex\.europa\.eu|federalregister\.gov|ecfr\.gov|govinfo\.gov|legislation\.gov\.uk)/i;
const REG = new Set(["regulation", "directive", "standard", "guidance", "framework"]);
const FLOOR = 2;

const items = (await all("intelligence_items", "id,title,item_type,source_url,provenance_status,is_archived")).filter((r) => REG.has(r.item_type) && !r.is_archived);
const byId = new Map(items.map((r) => [r.id, r]));
const sources = await all("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const claims = await all("section_claim_provenance", "intelligence_item_id,claim_kind,source_span,source_tier_at_grounding");
// sub-floor FACT claims grouped by item
const subByItem = new Map();
for (const c of claims) { if (c.claim_kind !== "FACT" || c.source_tier_at_grounding == null || c.source_tier_at_grounding <= FLOOR || !byId.has(c.intelligence_item_id)) continue; (subByItem.get(c.intelligence_item_id) || subByItem.set(c.intelligence_item_id, []).get(c.intelligence_item_id)).push(c); }

let internalItems = 0, absentItems = 0, cbamClass = 0;
let internalFacts = 0, absentFacts = 0;
const absentList = [];
for (const [itemId, subs] of subByItem) {
  const it = byId.get(itemId);
  // authoritative (T1/T2) pool text for this item
  const { data: pool } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", itemId);
  const authText = (pool || []).filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= FLOOR; }).map((p) => (p.result_content_excerpt || "").toLowerCase()).join("\n");
  let nIn = 0, nAbs = 0;
  for (const c of subs) { const span = (c.source_span || "").toLowerCase().trim(); if (span.length > 12 && authText.includes(span)) nIn++; else nAbs++; }
  internalFacts += nIn; absentFacts += nAbs;
  if (nAbs === 0) internalItems++;
  else { absentItems++; const enacted = ENACTED_HOST.test(it.source_url || ""); if (enacted) cbamClass++; absentList.push(`${itemId.slice(0, 8)} [${it.item_type}] sub-floor ${subs.length} (in-pool ${nIn}/absent ${nAbs}) ${enacted ? "ENACTED-src(CBAM-class)" : "portal/other"} | ${(it.title || "").slice(0, 34)}`); }
}
console.log(`=== SUB-FLOOR DIAGNOSIS (reg items with >=1 sub-floor FACT) ===`);
console.log(`  sub-floor items: ${subByItem.size}   sub-floor FACT claims: ${internalFacts + absentFacts}`);
console.log(`  facts INTERNAL (span in T1/T2 pool -> groundBrief, ~free): ${internalFacts}`);
console.log(`  facts ABSENT  (regenerate-relabel OR targeted-fetch):      ${absentFacts}`);
console.log(`\n  items ALL-internal (cheap groundBrief path): ${internalItems}`);
console.log(`  items with ABSENT facts (regenerate/fetch path): ${absentItems}   of which CBAM-class (enacted src): ${cbamClass}`);
console.log(`\n=== ABSENT items (need regenerate-relabel or targeted-fetch) ===`);
for (const l of absentList.slice(0, 60)) console.log("  " + l);
process.exit(0);
