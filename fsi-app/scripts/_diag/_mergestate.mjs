import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);
const losers=["addc7d05","de15227a","295fba96","c096820c","dcb667a7","410466f8","dae165c8"];
console.log("=== the 7 merge losers' current status ===");
for(const p of losers){const r=(await q(`SELECT id,status,left(name,32) n FROM sources WHERE id::text LIKE $1`,[p+"%"]))[0];console.log(`  ${p} ${r.status.padEnd(10)} ${r.n}`);}
console.log("\n=== blocked item e68c91e5 ===");
const i=(await q(`SELECT provenance_status, source_id FROM intelligence_items WHERE id::text LIKE 'e68c91e5%'`))[0];
console.log(`  provenance_status=${i.provenance_status}  source_id=${i.source_id?.slice(0,8)}`);
console.log("\n=== active source count ===");
console.log("  "+(await q(`SELECT count(*)::int n FROM sources WHERE status='active'`))[0].n+" (was 728)");
await c.end();
