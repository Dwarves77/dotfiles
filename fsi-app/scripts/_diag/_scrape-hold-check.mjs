// READ-ONLY: is the scraping HOLD actually honored RIGHT NOW? The hold is data-gated:
//  (1) system_state.global_processing_paused, (2) sources.auto_run_enabled=false on all,
//  (3) pending_first_fetch queue empty. Definitive proof = recent WORKER scrape events.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const since = (h) => new Date(Date.now() - h*3600*1000).toISOString();

// (1) global pause
const { data: ss } = await sb.from("system_state").select("global_processing_paused").eq("id", true).maybeSingle();
console.log(`[1] system_state.global_processing_paused = ${ss ? ss.global_processing_paused : "(no row)"}`);

// (2) auto_run_enabled distribution (the per-source kill switch = the hold)
const cnt = async (col, val) => { const { count } = await sb.from("sources").select("id", { count: "exact", head: true }).eq(col, val); return count; };
console.log(`[2] sources auto_run_enabled=true: ${await cnt("auto_run_enabled", true)}  | =false: ${await cnt("auto_run_enabled", false)}  | processing_paused=true: ${await cnt("processing_paused", true)}`);

// (3) pending_first_fetch queue (drain-first-fetch input)
try {
  const { count: pfTotal } = await sb.from("pending_first_fetch").select("id", { count: "exact", head: true });
  const { count: pfPending } = await sb.from("pending_first_fetch").select("id", { count: "exact", head: true }).eq("status", "pending");
  console.log(`[3] pending_first_fetch rows total: ${pfTotal} | status=pending: ${pfPending}`);
} catch (e) { console.log(`[3] pending_first_fetch: ${e.message}`); }

// (4) DEFINITIVE PROOF — worker scrape events (check-sources inserts one accessibility_check per source RENDERED)
const evWin = async (h) => { const { data } = await sb.from("source_trust_events").select("created_at,created_by,event_type").eq("event_type","accessibility_check").gte("created_at", since(h)).order("created_at",{ascending:false}).limit(1000); return data || []; };
const ev24 = await evWin(24), ev168 = await evWin(168);
console.log(`[4] accessibility_check events: last 24h=${ev24.length} | last 7d=${ev168.length}`);
if (ev24.length) console.log(`    most recent: ${ev24[0].created_at} by ${ev24[0].created_by}  <-- check-sources IS scraping`);
else console.log(`    none in 24h -> check-sources scraped NOTHING (hold honored on accessibility path)`);

// (5) monitoring_queue recent (another per-scrape insert)
try { const { count } = await sb.from("monitoring_queue").select("source_id",{count:"exact",head:true}).gte("checked_at", since(24)); console.log(`[5] monitoring_queue rows last 24h: ${count}`); } catch(e){ console.log(`[5] monitoring_queue: ${e.message}`); }

// (6) agent_runs recent (drain -> agent/run generation = scrape+web_search). proof of unattended generation
try {
  const { data: ar } = await sb.from("agent_runs").select("created_at,status,trigger,created_by").gte("created_at", since(168)).order("created_at",{ascending:false}).limit(50);
  console.log(`[6] agent_runs last 7d: ${(ar||[]).length}`);
  if ((ar||[]).length) { for (const r of ar.slice(0,8)) console.log(`    ${r.created_at} status=${r.status} trigger=${r.trigger??"?"} by=${r.created_by??"?"}`); }
  else console.log(`    none -> no unattended generation in 7d`);
} catch(e){ console.log(`[6] agent_runs: ${e.message}`); }
process.exit(0);
