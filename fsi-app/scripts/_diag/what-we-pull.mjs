/** READ-ONLY. What type of information are we pulling from every source? That = the label.
 * Shows category (the content-type label) + intelligence_types (what specifically) + samples. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s)=>c.query(s).then(r=>r.rows);

console.log("=== CATEGORY = what type of info we pull (the source label). active sources ===");
for(const r of await q(`SELECT category, count(*)::int n FROM sources WHERE status='active' GROUP BY 1 ORDER BY 2 DESC`))
  console.log(`  ${String(r.category).padEnd(18)} ${r.n}`);

console.log("\n=== intelligence_types (what SPECIFICALLY we pull) per category — vocab is inconsistent ===");
for(const r of await q(`SELECT category, array_to_string(intelligence_types,',') it, count(*)::int n
   FROM sources WHERE status='active' GROUP BY 1,2 ORDER BY 1, 3 DESC`)) console.log(`  ${String(r.category).padEnd(17)} {${r.it}}  x${r.n}`);

console.log("\n=== sample sources: name | category | intelligence_types (is the label right?) ===");
for(const r of await q(`SELECT left(name,38) name, category, array_to_string(intelligence_types,',') it
   FROM sources WHERE status='active' ORDER BY random() LIMIT 16`))
  console.log(`  ${String(r.name).padEnd(38)} ${String(r.category).padEnd(16)} {${r.it}}`);
await c.end();
