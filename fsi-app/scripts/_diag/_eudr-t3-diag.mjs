// READ-ONLY: WHY are EUDR's sub-floor (T3) FACT claims T3, and is the fix INTERNAL or a TARGETED FETCH?
// For each T3 FACT claim, is its source_span ALREADY present (verbatim) in one of EUDR's AUTHORITATIVE
// (T1/T2) pool sources (the enacted CELEX text)?  present  -> internal re-ground can re-match it to T1/T2
// (no fetch);  absent  -> the supporting authoritative text is genuinely missing from the pool (targeted
// fetch of the instrument, or research-or-erase). This tells the dominant batch pattern. No spend.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { hostOf, buildResolver } = await jiti.import("../../src/lib/sources/institution.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = async (t, c, eqcol, eqval) => { const o = []; for (let f = 0; ; f += 1000) { let q = sb.from(t).select(c).order("id").range(f, f + 999); if (eqcol) q = q.eq(eqcol, eqval); const { data } = await q; if (!data?.length) break; o.push(...data); if (data.length < 1000) break; } return o; };

const it = (await sb.from("intelligence_items").select("id,title,source_url").ilike("title", "%EUDR%").limit(5)).data.find((r) => r.id.startsWith("1e80067a"));
console.log(`EUDR ${it.id.slice(0, 8)}  source=${it.source_url}\n`);

const sources = await all("sources", "id,url,base_tier,effective_tier,tier_override");
const resolver = buildResolver(sources);
const pool = await all("agent_run_searches", "id,result_url,result_content_excerpt", "intelligence_item_id", it.id);
// authoritative (T1/T2) pool text = the enacted-grade sources in the pool
const authText = pool.filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= 2; })
  .map((p) => (p.result_content_excerpt || "").toLowerCase()).join("\n");
const authHosts = [...new Set(pool.filter((p) => { const t = resolver.resolveSpan(p.result_url).tier; return t != null && t <= 2; }).map((p) => hostOf(p.result_url)))];
console.log(`pool rows: ${pool.length}   authoritative(T1/T2) pool sources: ${authHosts.join(", ") || "(none!)"}   authText=${authText.length}ch\n`);

const claims = await all("section_claim_provenance", "claim_kind,source_span,source_tier_at_grounding,search_result_id,claim_text", "intelligence_item_id", it.id);
const t3 = claims.filter((c) => c.claim_kind === "FACT" && c.source_tier_at_grounding != null && c.source_tier_at_grounding > 2);
const srById = new Map(pool.map((p) => [p.id, p]));
console.log(`SUB-FLOOR (T>2) FACT claims: ${t3.length}\n`);
let present = 0, absent = 0;
for (const c of t3) {
  const span = (c.source_span || "").toLowerCase().trim();
  const inAuth = span.length > 12 && authText.includes(span);
  const srcHost = c.search_result_id ? hostOf(srById.get(c.search_result_id)?.result_url || "") : "(?)";
  if (inAuth) present++; else absent++;
  console.log(`  [T${c.source_tier_at_grounding} from ${srcHost}] ${inAuth ? "IN-AUTH-POOL ✓ (internal re-ground)" : "absent from authoritative pool (fetch/erase)"}`);
  console.log(`     span: "${(c.source_span || "").slice(0, 90)}"`);
}
console.log(`\n=== EUDR VERDICT ===`);
console.log(`  ${present}/${t3.length} sub-floor facts have their span ALREADY in a T1/T2 pool source -> INTERNAL re-ground (no fetch)`);
console.log(`  ${absent}/${t3.length} absent from authoritative pool -> targeted fetch of the instrument OR research-or-erase`);
console.log(`  dominant path: ${present >= absent ? "INTERNAL (cheap, data present)" : "FETCH/ERASE (data missing)"}`);
process.exit(0);
