import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s)=>c.query(s).then(r=>r.rows);
const RX=/intelligence_changes|source_conflicts/i;
console.log("=== DB functions writing/referencing intelligence_changes or source_conflicts ===");
let f=0;for(const r of await q(`SELECT proname, pg_get_functiondef(p.oid) s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`)) if(RX.test(r.s)){f++;const w=/insert\s+into\s+(public\.)?(intelligence_changes|source_conflicts)|update\s+(public\.)?(intelligence_changes|source_conflicts)/i.test(r.s);console.log(`  fn ${r.proname} ${w?'[WRITES]':'[refs]'}`);}
if(!f)console.log("  (none)");
console.log("\n=== triggers referencing them ===");
let t=0;for(const r of await q(`SELECT tg.tgname, pg_get_functiondef(p.oid) s FROM pg_trigger tg JOIN pg_proc p ON p.oid=tg.tgfoid WHERE NOT tg.tgisinternal`)) if(RX.test(r.s)){t++;console.log(`  trigger ${r.tgname}`);}
if(!t)console.log("  (none)");
console.log("\n=== row counts (still empty?) ===");
for(const t of ["intelligence_changes","source_conflicts","monitoring_queue"]) console.log(`  ${t}: ${(await q(`SELECT count(*)::int n FROM ${t}`))[0].n} rows`);
console.log("\n=== monitoring_queue: any change_detected=true ever? ===");
console.log("  change_detected=true rows: "+(await q(`SELECT count(*)::int n FROM monitoring_queue WHERE change_detected=true`))[0].n);
await c.end();
