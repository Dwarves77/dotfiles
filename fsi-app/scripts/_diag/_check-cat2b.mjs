import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const sb = readClient();
const items = await readAll("intelligence_items","id,legacy_id,provenance_status,last_regenerated_at");
for (const k of ["e2e03e1b","t1"]) { const it = items.find(x=>x.legacy_id===k||x.id.slice(0,8)===k); console.log(`${k}: status=${it?.provenance_status} last_regen=${String(it?.last_regenerated_at).slice(0,19)}`); }
let total=0,off=0; for(;;){const{data}=await sb.from("agent_runs").select("cost_usd_estimated").order("id").range(off,off+999);if(!data||!data.length)break;for(const r of data)total+=Number(r.cost_usd_estimated)||0;if(data.length<1000)break;off+=1000;}
const its=await readAll("intelligence_items","provenance_status,is_archived");const c={};for(const it of its)if(!it.is_archived)c[it.provenance_status||"null"]=(c[it.provenance_status||"null"]||0)+1;
console.log(`program=$${total.toFixed(4)} census=${JSON.stringify(c)}`);
