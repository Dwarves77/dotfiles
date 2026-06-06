/** Rule-4 artifact check (fixed id matching + error capture). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const PREFIXES = ["eb6641da", "3373d06e", "88c3a053"];
// fetch recent research/market briefs and match by id prefix in JS (uuid ilike won't cast)
const { data: pool, error: poolErr } = await sb.from("intelligence_items")
  .select("id,title,item_type,source_id,provenance_status,full_brief")
  .order("updated_at", { ascending: false }).limit(400);
if (poolErr) console.log("pool err:", poolErr.message);

for (const pre of PREFIXES) {
  const it = (pool || []).find((r) => r.id.startsWith(pre));
  if (!it) { console.log(`\n[${pre}] not in last 400 updated`); continue; }
  const briefHasNSI = /#+\s*New Sources Identified/i.test(it.full_brief || "");
  const { count: factN } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", it.id).eq("claim_kind", "FACT");
  const { count: anaN } = await sb.from("section_claim_provenance").select("id", { count: "exact", head: true }).eq("intelligence_item_id", it.id).eq("claim_kind", "ANALYSIS");
  const { count: secN } = await sb.from("intelligence_item_sections").select("id", { count: "exact", head: true }).eq("item_id", it.id);
  const { data: edges } = await sb.from("source_citations").select("citing_source_id,context").eq("cited_source_id", it.source_id);
  const { data: src } = await sb.from("sources").select("name,base_tier,effective_tier,trust_score_citation,independent_citers,confirmation_count").eq("id", it.source_id).single();
  console.log(`\n[${pre}] ${it.title?.slice(0, 46)}  (${it.item_type})  status=${it.provenance_status}`);
  console.log(`  brief=${(it.full_brief || "").length}ch  sections=${secN}  FACT=${factN} ANALYSIS=${anaN}  NSI_table=${briefHasNSI}`);
  console.log(`  source=${src?.name?.slice(0, 38)} tier=${src?.effective_tier ?? src?.base_tier} trust_citation=${src?.trust_score_citation} independent_citers=${src?.independent_citers}`);
  console.log(`  source_citations edges INTO source: ${(edges || []).length}  [${(edges || []).map((e) => e.context).slice(0, 5).join(", ")}]`);
}

// regional_data shape — discover real columns
console.log(`\n=== regional_data sample (raw row keys) ===`);
const { data: rd, error: rdErr } = await sb.from("intelligence_items").select("*").eq("item_type", "regional_data").eq("is_archived", false).limit(3);
if (rdErr) console.log("rd err:", rdErr.message);
if (rd && rd[0]) {
  console.log("columns:", Object.keys(rd[0]).join(", "));
  for (const r of rd) console.log(`  ${r.id.slice(0,8)} topic_tags=${JSON.stringify(r.topic_tags)} opscen=${JSON.stringify(r.operational_scenario_tags)} title="${r.title?.slice(0,44)}"`);
}
process.exit(0);
