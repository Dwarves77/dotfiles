/** Reclassify mis-typed guidance/framework items + archive portal artifacts (Agent-1 corrected gate).
 *  DRY-RUN by default; pass --apply to write. Verifies each item (shows title) before/after. */
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");
const toMarket = ["sg-singapore-green-finance-incentive-scheme-for-maritime-decarbonisation","south-korea-k-taxonomy-for-sustainable-transport-activities","r15","538c2774","340ddf31","7d5bd5a1","5d2e7616","2648d4ad","7115c978","537b8131"];
const toResearch = ["abd29144"];
const archive = ["ea6cfff1","1293f278","128a1148"];
async function find(idf){ // match legacy_id exact OR id prefix
  let { data } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,is_archived").eq("legacy_id",idf).limit(1);
  if(!data?.length){ const { data: all } = await sb.from("intelligence_items").select("id,legacy_id,title,item_type,is_archived").limit(2000); data = (all||[]).filter(r=>r.id.startsWith(idf)); }
  return data?.[0]; }
async function run(list,label,fn){ console.log(`\n=== ${label} ===`);
  for(const idf of list){ const it=await find(idf); if(!it){console.log(`  ?? NOT FOUND: ${idf}`);continue;}
    console.log(`  ${it.id.slice(0,8)} [${it.item_type}${it.is_archived?",archived":""}] ${(it.title||"").slice(0,52)}`);
    if(APPLY){ const upd=fn(it); const { error }=await sb.from("intelligence_items").update(upd).eq("id",it.id); console.log(`     -> ${error?"ERR "+error.message:JSON.stringify(upd)+" APPLIED"}`); } } }
await run(toMarket,`RECLASSIFY -> market_signal (${toMarket.length})`,()=>({item_type:"market_signal",provenance_status:"quarantined"}));
await run(toResearch,`RECLASSIFY -> research_finding (${toResearch.length})`,()=>({item_type:"research_finding",provenance_status:"quarantined"}));
await run(archive,`ARCHIVE portal_artifact (${archive.length})`,()=>({is_archived:true,archive_reason:"portal_artifact"}));
console.log(`\n${APPLY?"APPLIED":"DRY-RUN (pass --apply to write)"}`); process.exit(0);
