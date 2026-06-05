import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pool } = await sb.from("intelligence_items").select("id,title").eq("item_type","research_finding").eq("provenance_status","verified").limit(50);
const it = (pool||[]).find(r => r.id.startsWith("ed6c5c76")) || (pool||[])[0];
console.log("EXEMPLAR:", it.title, "\n");
const { data: secs } = await sb.from("intelligence_item_sections").select("section_key,content_md").eq("item_id", it.id).order("section_order");
for (const s of secs||[]) console.log(`\n##### S${s.section_key} (${(s.content_md||"").length}ch) #####\n${(s.content_md||"").slice(0,700)}`);
process.exit(0);
