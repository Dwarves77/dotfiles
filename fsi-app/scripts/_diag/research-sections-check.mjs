import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: items } = await sb.from("intelligence_items").select("id,title,provenance_status").eq("item_type","research_finding").eq("provenance_status","verified").limit(6);
for (const it of items||[]) { const { data: secs } = await sb.from("intelligence_item_sections").select("section_key").eq("item_id", it.id).order("section_order");
  console.log(`${it.id.slice(0,8)} ${(it.title||"").slice(0,40)} -> sections: [${(secs||[]).map(s=>s.section_key).join(",")}]`); }
process.exit(0);
