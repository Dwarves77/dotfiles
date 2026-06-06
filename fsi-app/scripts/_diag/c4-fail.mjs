import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pool } = await sb.from("intelligence_items").select("id,title,full_brief").order("updated_at",{ascending:false}).limit(300);
const it=(pool||[]).find(r=>r.id.startsWith("62ba40b0")); if(!it){console.log("not found");process.exit(0)}
const v = await sb.rpc("validate_item_provenance",{p_item_id:it.id});
console.log("validate:", JSON.stringify(v.data?.[0]?.failures||v.data).slice(0,300));
// find a binding-verb sentence in the brief that lacks a label
const sents=(it.full_brief||"").split(/(?<=[.!?])\s+/).filter(s=>/\b(must|requires|mandates|obligates|prohibits|applies to)\b/i.test(s));
console.log("\nsample binding-verb sentences (criterion-4 risk):");
for(const s of sents.slice(0,4)) console.log("  • "+s.replace(/\s+/g," ").slice(0,150));
process.exit(0);
