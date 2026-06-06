import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await sb.from("intelligence_items").select("id,title,item_type,source_url,provenance_status").in("item_type",["technology","innovation"]).eq("is_archived",false).not("source_url","is",null).limit(40);
const real = (data||[]).filter(r=>/^https?:\/\/[^/]+\/.+/.test(r.source_url||""));
for (const r of real.slice(0,12)) console.log(`${r.id.slice(0,8)} ${r.item_type.padEnd(11)} ${r.provenance_status.slice(0,11).padEnd(12)} ${(r.title||"").slice(0,46)}`);
