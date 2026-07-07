import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const { data } = await sb.from("agent_runs").select("cost_usd_estimated,fetch_method,started_at").eq("fetch_method","spend-call").order("started_at",{ascending:false}).limit(30);
const sum = (data||[]).reduce((a,r)=>a+Number(r.cost_usd_estimated||0),0);
console.log(`spend-call rows (last 30): ${data.length}, sum=$${sum.toFixed(4)}, newest=${String(data[0]?.started_at).slice(0,19)}`);
