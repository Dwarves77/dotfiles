/** Criterion-4 fix sample validation: 5 quarantined REGs + 2 quarantined NON-REG (market+research),
 *  through the canonical pipeline with the updated system-prompt. Reports per-item outcome + reason. */
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { createJiti } from "jiti"; import { createClient } from "@supabase/supabase-js";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const P = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const real = (u)=>/^https?:\/\/[^/]+\/.+/.test(u||"");
async function pick(types,n){ const { data }=await sb.from("intelligence_items").select("id,title,item_type,source_url").in("item_type",types).eq("is_archived",false).eq("provenance_status","quarantined").not("source_url","is",null).limit(60); return (data||[]).filter(r=>real(r.source_url)).slice(0,n); }
const sample=[...await pick(["regulation"],5),...await pick(["market_signal","initiative"],1),...await pick(["research_finding"],1)];
let v=0,q=0;
for(const it of sample){ const t0=Date.now(); process.stdout.write(`[${it.item_type.slice(0,10).padEnd(10)}] ${it.id.slice(0,8)} ${(it.title||"").slice(0,38).padEnd(38)} `);
  try{ const g=await P.generateBrief(it.id); if(!g.ok){console.log(`gen FAIL`);continue;} const s=await P.sectionBrief(it.id); if(!s.ok){console.log(`sec FAIL`);continue;}
    const gr=await P.groundBrief(it.id); if(gr.ok){await P.growSources(it.id);v++;console.log(`VERIFIED ${Math.round((Date.now()-t0)/1000)}s`);} else {q++;console.log(`QUAR: ${gr.detail.replace(/\s+/g," ").slice(0,55)}`);}
  }catch(e){q++;console.log(`EXC: ${String(e.message||e).slice(0,40)}`);}}
console.log(`\n=== sample: VERIFIED=${v} QUARANTINED=${q} of ${sample.length} ===`); process.exit(0);
