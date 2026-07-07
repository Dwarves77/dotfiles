import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const items = await readAll("intelligence_items","id,legacy_id");
for (const k of ["355af9e8","6f1e6615"]) {
  const it = items.find(x=>x.id.slice(0,8)===k);
  const facts = await readAll("section_claim_provenance","search_result_id,source_span,source_tier_at_grounding,claim_kind",{match:(q)=>q.eq("intelligence_item_id",it.id).eq("claim_kind","FACT")});
  for (const f of facts) {
    if (!f.search_result_id) continue;
    const { data } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("id",f.search_result_id).maybeSingle();
    const exc = data?.result_content_excerpt||"";
    const is404 = /Page Not Found/i.test(exc) || exc.length<3200 && /EUR-Lex/i.test(exc) && !/Article\s+\d/i.test(exc);
    if (is404 || (data && exc.length<3500)) {
      const spanInErr = exc.toLowerCase().includes(String(f.source_span||"").toLowerCase().trim());
      console.log(`  ${k}: FACT tier=${f.source_tier_at_grounding} cap_len=${exc.length} url=${(data?.result_url||"").slice(0,60)} span_in_cap=${spanInErr}`);
      console.log(`     span="${String(f.source_span||"").slice(0,90)}"`);
    }
  }
}
