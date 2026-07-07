import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
// note (a): the 2 open truncation-guard flags
const tflags = await readAll("integrity_flags","subject_ref,status,description",{match:(q)=>q.eq("created_by","truncation-guard").eq("status","open")});
console.log("NOTE(a) open truncation-guard flags:", tflags.length);
for (const f of tflags) console.log(`   item ${String(f.subject_ref).slice(0,8)} — ${String(f.description).slice(0,80)}`);
// note (b): cat-2 items whose ONLY failure is coverage/unlabeled (first re-queue candidates post cat-2 fix)
const audit = JSON.parse(readFileSync(resolve(ROOT,"scripts","_plans","completeness-audit.json"),"utf8"));
let soleCandidates=0; const list=[];
for (const x of audit.cat2) {
  const { data } = await sb.rpc("validate_item_provenance",{p_item_id:x.id});
  const r = Array.isArray(data)?data[0]:data;
  const reasons=[...new Set((r?.failures||[]).map(f=>f.reason))];
  const onlyCoverage = reasons.length>0 && reasons.every(rz=>["missing_required_slot","unlabeled_assertion","no_section_content"].includes(rz));
  if (onlyCoverage && x.status!=="verified") { soleCandidates++; list.push(`${x.key}[${reasons.join(",")}]`); }
}
console.log(`\nNOTE(b) cat-2 items whose only failures are coverage/unlabeled (first re-queue post-fix): ${soleCandidates}`);
console.log("   "+list.join(", "));
// final census + program
let total=0,rows=0,off=0; for(;;){const{data}=await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(off,off+999);if(!data||!data.length)break;for(const rr of data)total+=Number(rr.cost_usd_estimated)||0;rows+=data.length;if(data.length<1000)break;off+=1000;}
const its=await readAll("intelligence_items","provenance_status,is_archived");const c={};for(const it of its)if(!it.is_archived)c[it.provenance_status||"null"]=(c[it.provenance_status||"null"]||0)+1;
console.log(`\nFINAL: agent_runs rows=${rows} program=$${total.toFixed(4)}/85 | census=${JSON.stringify(c)}`);
