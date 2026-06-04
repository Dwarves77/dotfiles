/** READ-ONLY. Registry state of the operator-flagged important sources: are they registered,
 * classified, and set to be pulled from (auto_run + access_method)? */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);
const NAMES=["MIT Climate Machine","SAFA","Sustainable Air Freight","SBTi","Science Based Targets","Singapore Green Plan","EU MRV","UNCTAD","System Advisor Model","SAM"];
console.log("=== sources matching the flagged important entities (Layer-1 registry state) ===");
console.log("  name | category | role | tier | access | auto_run | status | conf");
for(const n of NAMES){
  for(const r of await q(`SELECT name, category, coalesce(source_role,'(NULL)') role, base_tier bt, access_method am, auto_run_enabled ar, status, coalesce(classification_confidence,'(NULL)') conf
     FROM sources WHERE name ILIKE $1 ORDER BY name LIMIT 3`,[`%${n}%`]))
    console.log(`  ${String(r.name).slice(0,42).padEnd(42)} ${String(r.category).padEnd(15)} ${String(r.role).padEnd(22)} t${r.bt} ${String(r.am).padEnd(7)} auto=${r.ar} ${r.status} ${r.conf}`);
}
console.log("\n=== how many items carry each of these as a homepage-url source (one snapshot vs a stream) ===");
for(const n of ["MIT Climate Machine","Science Based Targets","UNCTAD","System Advisor Model"]){
  const r=(await q(`SELECT count(*)::int n FROM intelligence_items i JOIN sources s ON s.id=i.source_id WHERE s.name ILIKE $1 AND coalesce(i.is_archived,false)=false`,[`%${n}%`]))[0];
  console.log(`  ${n.padEnd(26)} active items from this source: ${r.n}`);
}
await c.end();
