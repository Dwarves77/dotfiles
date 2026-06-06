import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { count: gf } = await sb.from("intelligence_items").select("id",{count:"exact",head:true}).in("item_type",["guidance","framework"]).eq("is_archived",false);
const { count: regAll } = await sb.from("intelligence_items").select("id",{count:"exact",head:true}).in("item_type",["regulation","directive","standard","guidance","framework"]).eq("is_archived",false);
const { count: regQuar } = await sb.from("intelligence_items").select("id",{count:"exact",head:true}).in("item_type",["regulation","directive","standard","guidance","framework"]).eq("is_archived",false).eq("provenance_status","quarantined");
console.log(`guidance+framework non-archived now: ${gf}  (was 87)`);
console.log(`regulation-family non-archived: ${regAll}  | quarantined: ${regQuar}`);
process.exit(0);
