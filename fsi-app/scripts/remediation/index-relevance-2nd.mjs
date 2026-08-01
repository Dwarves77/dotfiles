#!/usr/bin/env node
// Index relevance SECOND-PASS — independent Sonnet judge over every titled would_mint entry (different model than the
// Haiku that scored it: independence is the point). Through the WALL (task=index-relevance-second-pass, cap $25) with
// fail-closed per-call ledger. Resumable (skips done). Stores per-row verdict to scripts/tmp/relevance-2nd.json.
// Agree (Sonnet relevant=true) -> publishable; disagree -> held-for-review. Run: --execute [--limit=N] [--budget=USD]
import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url"; import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertMeteredCallAllowed } from "../../src/lib/llm/metered-gate.mjs";
import { canonicalGenerate, textOf } from "../lib/anthropic.mjs"; // rule 016: canonical script-side Anthropic path
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); process.loadEnvFile(resolve(ROOT, ".env.local"));
const EXECUTE = process.argv.includes("--execute");
const LIMIT = (() => { const a = process.argv.find(x=>x.startsWith("--limit=")); return a?parseInt(a.slice(8),10):Infinity; })();
const CAP = 25, MODEL = "claude-sonnet-4-6", TASK = "index-relevance-second-pass", CONC = 8;
const BUDGET = (() => { const a = process.argv.find(x=>x.startsWith("--budget=")); const r=a?parseFloat(a.slice(9)):CAP; return Math.min(r,CAP); })();
const IN=3/1e6, OUT=15/1e6, LEDGER_TAG=TASK;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const TITLES = JSON.parse(readFileSync(resolve(ROOT,"scripts/tmp/census-titles.json"),"utf8"));
const titleFor = (r)=>TITLES[r.instrument_identifier]||TITLES["UK:"+r.document_url]||null;
const OUTFILE = resolve(ROOT,"scripts/tmp/relevance-2nd.json");
const done = existsSync(OUTFILE) ? JSON.parse(readFileSync(OUTFILE,"utf8")) : {};
const SYS = `You are an INDEPENDENT second-opinion relevance judge for a freight-sustainability intelligence platform. Given ONLY an instrument's title, judge whether it genuinely bears on sustainability/environmental regulation, cost, market, research, or operations for INTERNATIONAL FREIGHT FORWARDING (broad: transport modes, emissions, energy, packaging, EPR, batteries/EV, labor/wage, finance/taxonomy, product/ecodesign, due-diligence/reporting). Return STRICT JSON {"relevant":true|false,"confidence":"HIGH|MEDIUM|LOW","reason":"<=100 chars naming the title's actual subject"}. Judge ONLY from the title's real subject; if genuinely uninformative, relevant=false LOW.`;
// wall FIRST (fail-closed on token/task/cap)
assertMeteredCallAllowed({ callClass:"batch-classification", model:MODEL, capUsd:BUDGET, env:process.env, task:TASK });
console.log(`wall PASS: Sonnet / ${TASK} / cap $${BUDGET}`);
// ledger baseline (paginated)
let baseline=0; { const all=[]; for(let f=0;;f+=1000){ const {data,error}=await sb.from("agent_runs").select("cost_usd_estimated").like("source_url",`${LEDGER_TAG}%`).range(f,f+999); if(error){console.error("FATAL baseline:",error.message);process.exit(2);} if(!data?.length)break; all.push(...data); if(data.length<1000)break;} baseline=all.reduce((a,r)=>a+(+r.cost_usd_estimated||0),0);} 
console.log(`ledger baseline: $${baseline.toFixed(4)} | headroom $${(BUDGET-baseline).toFixed(2)}`);
let rows=[]; for(let from=0;;from+=1000){ const {data}=await sb.from("census_worklist").select("id,instrument_identifier,document_url,notes").eq("dryrun_disposition","would_mint").order("id").range(from,from+999); if(!data?.length)break; rows.push(...data); if(data.length<1000)break; }
rows = rows.map(r=>({...r,t:titleFor(r)})).filter(r=>r.t&&r.t.length>=8 && !done[r.id]);
rows = rows.slice(0, LIMIT===Infinity?rows.length:LIMIT);
console.log(`titled would_mint to second-judge (not yet done): ${rows.length}`);
if(!EXECUTE){ console.log("dry-run: no calls."); process.exit(0); }
let spent=0, agree=0, disagree=0, errs=0, halted=false, idx=0;
async function upd(id,patch){ const {error}=await sb.from("agent_runs").insert(patch); if(error) throw new Error(`ledger: ${error.message}`); }
async function worker(){ while(idx<rows.length && !halted){ const r=rows[idx++];
  try{ // Rule 016: routed through the canonical script wrapper (scripts/lib/anthropic.mjs), not a raw fetch.
    const j=await canonicalGenerate({model:MODEL,maxTokens:150,system:SYS,messages:[{role:"user",content:`TITLE: ${r.t}`}]});
    const cost=j.usage.input_tokens*IN+j.usage.output_tokens*OUT; spent+=cost;
    await upd(r.id,{cost_usd_estimated:Number(cost.toFixed(6)),status:"success",model:MODEL,source_url:LEDGER_TAG}); // FAIL-CLOSED ledger
    const m=(textOf(j)||"").match(/\{[\s\S]*\}/); let cls=null; try{cls=JSON.parse(m[0]);}catch{}
    const agrees = cls?.relevant===true; // first verdict was would_mint(=relevant)
    done[r.id]={relevant:cls?.relevant??null,confidence:cls?.confidence,reason:(cls?.reason||"").slice(0,110),agrees,judge:MODEL};
    if(agrees) agree++; else disagree++;
    if((agree+disagree)%100===0){ writeFileSync(OUTFILE,JSON.stringify(done)); console.log(`  ${agree+disagree}/${rows.length} | agree ${agree} disagree ${disagree} | $${(baseline+spent).toFixed(2)}`); }
  }catch(e){ errs++; if(errs<=8) console.warn(`  err ${r.id}: ${String(e.message).slice(0,60)}`); }
  if(baseline+spent>=BUDGET){ halted=true; console.log(`\n*** HALT cumulative $${(baseline+spent).toFixed(3)} >= $${BUDGET} ***`); }
}}
await Promise.all(Array.from({length:CONC},worker));
writeFileSync(OUTFILE,JSON.stringify(done));
console.log(`\ndone: agree ${agree} disagree ${disagree} errs ${errs} | this-run $${spent.toFixed(3)} | cumulative $${(baseline+spent).toFixed(3)} | stored ${Object.keys(done).length} -> ${OUTFILE}`);
