import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const pre of ["72be8dd3","e360e82f"]) {
  const { data } = await sb.from("intelligence_items").select("id,title,source_url").eq("id", (await sb.from("intelligence_items").select("id").ilike("id",pre+"%").limit(1)).data?.[0]?.id || "x").limit(1);
  // simpler: find by prefix
  const { data: all } = await sb.from("intelligence_items").select("id,title,source_url").limit(2000);
  const it = (all||[]).find(r=>r.id.startsWith(pre)); if(!it){console.log(`${pre} not found`);continue;}
  const { error } = await sb.from("intelligence_items").update({ is_archived:true, archive_reason:"institutional_source", archive_note:"Institutional body = source, not an intelligence item; belongs in the sources registry (CLAUDE.md known-debt; slot-fit triage)" }).eq("id", it.id);
  console.log(`${error?"ERR "+error.message:"ARCHIVED institutional_source"}: ${it.id.slice(0,8)} ${(it.title||"").slice(0,40)}`);
  // also: is it already a source in the registry?
  let host=""; try{host=new URL(it.source_url).host;}catch{}
  const { data: src } = await sb.from("sources").select("id,name").ilike("url",`%${host}%`).limit(1);
  console.log(`   in sources registry: ${src?.length?"YES ("+src[0].name?.slice(0,30)+")":"NO -> registry candidate"}`);
}
process.exit(0);
