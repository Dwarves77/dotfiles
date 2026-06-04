import pg from "pg"; import { readFileSync } from "node:fs"; import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const __d=dirname(fileURLToPath(import.meta.url)); const R=resolve(__d,"..",".."); process.loadEnvFile(resolve(R,".env.local"));
const ref=readFileSync(resolve(R,"supabase/.temp/project-ref"),"utf8").trim(); const pl=readFileSync(resolve(R,"supabase/.temp/pooler-url"),"utf8").trim();
const c=new pg.Client({connectionString:pl.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`)}); await c.connect();
const q=(s)=>c.query(s).then(r=>r.rows);
try{
  console.log("=== Q3: UNIQUE indexes/constraints on intelligence_items ===");
  for(const r of await q(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='intelligence_items' AND indexdef ILIKE '%UNIQUE%'`)) console.log(`  ${r.indexname}: ${r.indexdef.replace(/.*USING/,'USING')}`);
  console.log("\n=== Q3: legacy_id / source_url / instrument_identifier uniqueness + null counts (active) ===");
  for(const col of ['legacy_id','source_url','source_id','instrument_identifier']){
    const r=(await q(`SELECT count(*)::int n, count(${col})::int nn, count(DISTINCT ${col})::int d FROM intelligence_items WHERE is_archived=false`))[0];
    console.log(`  ${col}: ${r.nn}/${r.n} populated, ${r.d} distinct`);
  }
  console.log("\n=== Q4: version-snapshot trigger function body ===");
  const fn=(await q(`SELECT pg_get_functiondef('trg_intelligence_items_version_snapshot'::regproc) s`).catch(()=>[]))[0];
  if(fn) for(const l of fn.s.split("\n")) if(/INSERT|version_number|NEW\.|snapshot|VALUES|SELECT/.test(l)) console.log("  "+l.trim().slice(0,120));
  console.log("\n=== Q4: who writes intelligence_changes? (live rows + any writer trigger) ===");
  console.log("  intelligence_changes rows:", (await q(`SELECT count(*)::int n FROM intelligence_changes`))[0].n);
  for(const r of await q(`SELECT tgname FROM pg_trigger WHERE tgrelid='intelligence_changes'::regclass AND NOT tgisinternal`)) console.log("  trigger:",r.tgname);
  console.log("\nREAD-ONLY.");
}finally{await c.end();}
