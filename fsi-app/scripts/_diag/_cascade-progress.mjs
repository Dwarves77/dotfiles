import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
let total=0,rows=0,off=0;
for(;;){const{data}=await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(off,off+999);if(!data||!data.length)break;for(const r of data)total+=Number(r.cost_usd_estimated)||0;rows+=data.length;if(data.length<1000)break;off+=1000;}
const items=await sb.from("intelligence_items").select("provenance_status").eq("is_archived",false);
const c={};for(const it of items.data||[])c[it.provenance_status||"null"]=(c[it.provenance_status||"null"]||0)+1;
const{data:sc}=await sb.from("agent_runs").select("started_at").eq("fetch_method","spend-call").order("started_at",{ascending:false}).limit(1);
console.log(`agent_runs rows=${rows} program=$${total.toFixed(4)} | census=${JSON.stringify(c)} | newest spend-call=${String(sc?.[0]?.started_at).slice(0,19)}`);
