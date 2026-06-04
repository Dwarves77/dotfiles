/** READ-ONLY. WHY 432 institutions? Size distribution, the singleton tail, and whether the
 * registrable-domain grain over-splits the SAME publisher across domains. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r.rows);

console.log("=== institution size distribution (active sources per institution) ===");
for(const r of await q(`SELECT n, count(*)::int institutions FROM (
   SELECT i.id, (SELECT count(*)::int FROM sources s WHERE s.institution_id=i.id AND s.status='active') n FROM institutions i) x
   GROUP BY n ORDER BY n`)) console.log(`  ${String(r.n).padStart(2)} source(s): ${r.institutions} institutions`);

const single=(await q(`SELECT count(*)::int n FROM (SELECT i.id FROM institutions i WHERE (SELECT count(*) FROM sources s WHERE s.institution_id=i.id AND s.status='active')=1) x`))[0].n;
console.log(`\n  SINGLETON institutions (exactly 1 source): ${single}  of 432`);

console.log("\n=== sample of SINGLETON institutions (legit distinct, or noise/over-split?) ===");
for(const r of await q(`SELECT i.registrable_domain rd, left(i.name,40) name FROM institutions i
   WHERE (SELECT count(*) FROM sources s WHERE s.institution_id=i.id AND s.status='active')=1 ORDER BY random() LIMIT 20`))
  console.log(`  ${String(r.rd).padEnd(30)} ${r.name}`);

console.log("\n=== US state .gov + AU state .gov.au + country ministries: how many distinct institutions? ===");
for(const pat of ["%.gov","%.gov.au","%.go.jp","%.gov.cn","%.gc.ca","%.govt.nz"]){
  const r=(await q(`SELECT count(distinct registrable_domain)::int n FROM institutions WHERE registrable_domain LIKE $1`,[pat]))[0].n;
  console.log(`  LIKE ${pat.padEnd(12)} -> ${r} institutions`);
}
console.log("\n=== could a COARSER grain (group by parent: e.g. all *.gov -> 'US Federal/State', europa.eu kept) reduce count? rough buckets ===");
for(const r of await q(`SELECT
   CASE WHEN registrable_domain LIKE '%.gov' THEN 'US .gov (state+federal)'
        WHEN registrable_domain LIKE '%.gov.au' THEN 'AU .gov.au'
        WHEN registrable_domain LIKE '%.europa.eu' OR registrable_domain='europa.eu' THEN 'EU europa.eu'
        WHEN registrable_domain LIKE '%.go.jp' OR registrable_domain LIKE '%.gov.cn' THEN 'JP/CN gov'
        ELSE 'other' END bucket, count(*)::int n
   FROM institutions GROUP BY 1 ORDER BY 2 DESC`)) console.log(`  ${r.bucket.padEnd(26)} ${r.n} institutions`);
await c.end();
