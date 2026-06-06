/** Diagnose MIT Climate Machine (88c3a053) 0-FACT grounding: was the stored generate pool empty/thin
 *  (so ground had no corpus), or did the ledger fail to produce FACT claims? Read-only. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: pool } = await sb.from("intelligence_items").select("id,title,source_url,provenance_status,full_brief").order("updated_at", { ascending: false }).limit(400);
const it = (pool || []).find((r) => r.id.startsWith("88c3a053"));
if (!it) { console.log("MIT not found in last 400"); process.exit(0); }
console.log(`MIT ${it.id.slice(0,8)} status=${it.provenance_status} brief=${(it.full_brief||"").length}ch source=${it.source_url}`);

const { data: searches } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt,search_query").eq("intelligence_item_id", it.id);
console.log(`\nstored pool rows (agent_run_searches): ${(searches||[]).length}`);
for (const s of searches || []) console.log(`  q=${s.search_query} len=${(s.result_content_excerpt||"").length}ch url=${(s.result_url||"").slice(0,70)}`);
const usable = (searches||[]).filter((s) => (s.result_content_excerpt||"").length > 200);
console.log(`  -> usable (>200ch) grounding corpus rows: ${usable.length}  (ground needs >=1)`);

// is the brief mostly labeled-analysis (so few FACT spans), and does it carry a ledger?
const brief = it.full_brief || "";
const hasLedger = /CLAIM_PROVENANCE_LEDGER/.test(brief);
const analysisLabels = (brief.match(/Analytical inference:|Industry interpretation:|Operational implication:/g) || []).length;
console.log(`\nbrief carries inline ledger marker: ${hasLedger}   analysis-label count in body: ${analysisLabels}`);
console.log(`brief head (first 600ch):\n${brief.slice(0, 600)}`);
process.exit(0);
