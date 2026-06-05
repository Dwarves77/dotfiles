import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createJiti } from "jiti"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: all } = await sb.from("intelligence_items").select("id,title").order("updated_at",{ascending:false}).limit(300);
for (const pre of process.argv.slice(2)) {
  const it = (all||[]).find(r=>r.id.startsWith(pre)); if(!it){console.log(`[${pre}] not found`);continue;}
  // clear any prior (rolled-back leaves none, but be safe) then re-ground only
  const gr = await P.groundBrief(it.id);
  const {data:fin}=await sb.from("intelligence_items").select("provenance_status").eq("id",it.id).single();
  const {count:f}=await sb.from("section_claim_provenance").select("id",{count:"exact",head:true}).eq("intelligence_item_id",it.id).eq("claim_kind","FACT");
  const {count:gp}=await sb.from("section_claim_provenance").select("id",{count:"exact",head:true}).eq("intelligence_item_id",it.id).eq("claim_kind","GAP");
  console.log(`[${pre}] ${(it.title||"").slice(0,42)} ground:${gr.ok?"OK":"FAIL"} ${gr.detail.slice(0,70)} => ${fin?.provenance_status?.toUpperCase()} FACT=${f} GAP=${gp}`);
}
process.exit(0);
