/** READ-ONLY. Does the label follow from what the source IS? Show role vs category vs
 * intelligence_types for the user's example types + count the incoherence. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);

console.log("=== the user's examples: does role->category->what-we-pull cohere? ===");
for(const n of ["MIT","BYD","Science Based Targets","SAFA","Tyndall","Fraunhofer","EcoVadis","BloombergNEF"]){
  for(const r of await q(`SELECT left(name,34) name, coalesce(source_role,'NULL') role, category, array_to_string(intelligence_types,',') it FROM sources WHERE name ILIKE $1 LIMIT 2`,[`%${n}%`]))
    console.log(`  ${String(r.name).padEnd(34)} role=${String(r.role).padEnd(22)} cat=${String(r.category).padEnd(16)} {${r.it}}`);
}

console.log("\n=== role -> category coherence across the registry (should be deterministic) ===");
for(const r of await q(`SELECT coalesce(source_role,'(NULL)') role, category, count(*)::int n FROM sources WHERE status='active' GROUP BY 1,2 ORDER BY role, n DESC`))
  console.log(`  ${String(r.role).padEnd(24)} -> ${String(r.category).padEnd(16)} ${r.n}`);
await c.end();
