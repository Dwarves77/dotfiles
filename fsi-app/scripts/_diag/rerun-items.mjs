import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createJiti } from "jiti"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const prefixes = process.argv.slice(2);
const { data: all } = await sb.from("intelligence_items").select("id,title,item_type").order("updated_at",{ascending:false}).limit(400);
for (const pre of prefixes) {
  const it = (all||[]).find(r=>r.id.startsWith(pre)); if(!it){console.log(`[${pre}] not found`);continue;}
  console.log(`\n[${pre}] ${(it.title||"").slice(0,46)} (${it.item_type})`);
  try {
    const g=await P.generateBrief(it.id); console.log(`  generate: ${g.ok?"OK":"FAIL"} ${g.detail}`); if(!g.ok)continue;
    const s=await P.sectionBrief(it.id); console.log(`  section : ${s.ok?"OK":"FAIL"} ${s.detail}`); if(!s.ok)continue;
    const gr=await P.groundBrief(it.id); console.log(`  ground  : ${gr.ok?"OK":"FAIL"} ${gr.detail}`);
    if(gr.ok){const gw=await P.growSources(it.id);console.log(`  grow    : ${gw.ok?"OK":"FAIL"} ${gw.detail}`);}
    const {data:fin}=await sb.from("intelligence_items").select("provenance_status").eq("id",it.id).single();
    const {count:f}=await sb.from("section_claim_provenance").select("id",{count:"exact",head:true}).eq("intelligence_item_id",it.id).eq("claim_kind","FACT");
    console.log(`  => ${fin?.provenance_status?.toUpperCase()} FACT=${f}`);
  } catch(e){console.log(`  EXCEPTION: ${String(e.message||e).slice(0,140)}`);}
}
console.log("\n=== rerun done ==="); process.exit(0);
