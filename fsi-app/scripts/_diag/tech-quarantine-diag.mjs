import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: pool } = await sb.from("intelligence_items").select("id,title").order("updated_at",{ascending:false}).limit(200);
const it = (pool||[]).find(r=>r.id.startsWith("dde5a446")); if(!it){console.log("not found");process.exit(0);}
const { data: secs } = await sb.from("intelligence_item_sections").select("section_key,content_md").eq("item_id", it.id).order("section_order");
const { data: searches } = await sb.from("agent_run_searches").select("result_url,result_content_excerpt").eq("intelligence_item_id", it.id);
const fetchedUrls = new Set((searches||[]).map(s=>s.result_url));
console.log("FETCHED/registered pool URLs:"); for(const s of searches||[]) console.log(`  [${(s.result_content_excerpt||"").length}ch] ${s.result_url}`);
// all URLs in section bodies
const allUrls = new Set(); for(const s of secs||[]) for(const u of (s.content_md||"").match(/https?:\/\/[^\s)\]}"'<>]+/g)||[]) allUrls.add(u.replace(/[.,;:]+$/,""));
console.log("\nURLs in section bodies NOT in fetched/registered pool (criterion-2 fails these):");
for(const u of allUrls) if(![...fetchedUrls].some(f=>f===u)) console.log(`  ${u}`);
process.exit(0);
