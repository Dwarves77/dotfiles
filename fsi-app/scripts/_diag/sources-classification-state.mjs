/** sources-classification-state.mjs — READ-ONLY. What classification already exists on the
 * sources registry, how complete it is, and which axis maps to "what it produces"
 * (regulations / news / industry analysis). Grounding for the finalize-every-source pass. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s)=>c.query(s).then(r=>r.rows);

console.log("=== sources: classification-relevant columns ===");
for(const r of await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='sources' AND column_name ~* 'categ|role|tier|type|class|status|domain|kind|access' ORDER BY column_name`))
  console.log(`  ${r.column_name.padEnd(26)} ${r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}`);

const total=(await q(`SELECT count(*)::int n FROM sources`))[0].n;
const active=(await q(`SELECT count(*)::int n FROM sources WHERE status='active'`))[0].n;
console.log(`\n=== ${total} sources total, ${active} active ===`);

for(const col of ["category","source_role","base_tier","effective_tier","source_type","access_method","status"]){
  const exists=(await q(`SELECT 1 FROM information_schema.columns WHERE table_name='sources' AND column_name='${col}'`)).length;
  if(!exists){console.log(`\n  (no column '${col}')`);continue;}
  console.log(`\n=== ${col} distribution (active) ===`);
  for(const r of await q(`SELECT coalesce(${col}::text,'(NULL)') v, count(*)::int n FROM sources WHERE status='active' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)) console.log(`  ${String(r.v).padEnd(28)} ${r.n}`);
}
await c.end();
