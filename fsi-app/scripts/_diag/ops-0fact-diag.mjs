import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pool } = await sb.from("intelligence_items").select("id,title").order("updated_at",{ascending:false}).limit(300);
const it = (pool||[]).find(r=>r.id.startsWith("e77f9426"));
const { data: searches } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
console.log("POOL (fetched/registered):"); for(const s of searches||[]) console.log(`  [${(s.result_content_excerpt||"").length}ch] ${s.result_url}`);
const usable = (searches||[]).filter(s=>(s.result_content_excerpt||"").length>200);
console.log(`  usable >200ch corpus rows: ${usable.length}`);
for (const k of ["FACT","ANALYSIS","GAP","LEGAL"]) { const {count}=await sb.from("section_claim_provenance").select("id",{count:"exact",head:true}).eq("intelligence_item_id",it.id).eq("claim_kind",k); console.log(`  claims ${k}: ${count}`); }
const { data: secs } = await sb.from("intelligence_item_sections").select("section_key,content_md").eq("item_id",it.id).order("section_order").limit(2);
console.log("\nS1 body (first 500ch):\n"+((secs?.[0]?.content_md)||"").slice(0,500));
process.exit(0);
