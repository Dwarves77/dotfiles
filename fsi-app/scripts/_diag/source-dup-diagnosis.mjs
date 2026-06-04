/** READ-ONLY. WHY do duplicate sources exist + at what scale. Shows the flagged dupes in
 * full (url/id/created), then global duplicate clusters by normalized name and by host. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);

console.log("=== the flagged duplicates in full (WHY are they separate rows?) ===");
for(const n of ["MIT Climate Machine","UNCTAD","Sustainable Air Freight","System Advisor Model"]){
  console.log(`\n  -- ${n} --`);
  for(const r of await q(`SELECT id, left(name,38) name, url, category, coalesce(source_role,'(NULL)') role, base_tier bt, coalesce(created_at::text,'?') created FROM sources WHERE name ILIKE $1 ORDER BY created`,[`%${n}%`]))
    console.log(`    ${r.id.slice(0,8)} [${r.category}/${r.role} t${r.bt}] ${r.url}`);
}

console.log("\n=== SCALE: duplicate clusters across the WHOLE registry ===");
const byName=await q(`SELECT lower(regexp_replace(name,'[^a-zA-Z0-9]+',' ','g')) k, count(*)::int n, array_agg(distinct status) st FROM sources GROUP BY 1 HAVING count(*)>1 ORDER BY 2 DESC`);
console.log(`  clusters with the SAME normalized name (>1 row): ${byName.length}  (extra rows: ${byName.reduce((a,b)=>a+b.n-1,0)})`);
for(const r of byName.slice(0,12)) console.log(`    x${r.n}  ${r.k.slice(0,46)}  [${r.st}]`);

const byHost=await q(`SELECT lower(split_part(split_part(url,'://',2),'/',1)) host, count(*)::int n FROM sources WHERE url IS NOT NULL GROUP BY 1 HAVING count(*)>1 ORDER BY 2 DESC`);
console.log(`\n  clusters sharing the SAME host (>1 row): ${byHost.length}  (extra rows: ${byHost.reduce((a,b)=>a+b.n-1,0)})`);
for(const r of byHost.slice(0,12)) console.log(`    x${String(r.n).padStart(3)}  ${r.host}`);

const tot=(await q(`SELECT count(*)::int n FROM sources`))[0].n;
console.log(`\n  total source rows: ${tot}`);
await c.end();
