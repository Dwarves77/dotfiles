/** sources-finalize-gap.mjs — READ-ONLY. The exact unfinalized set: NULL source_role, low/no
 * classification_confidence, and how category x role x intelligence_types line up. */
import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s)=>c.query(s).then(r=>r.rows);

console.log("=== classification_confidence (active) ===");
for(const r of await q(`SELECT coalesce(classification_confidence,'(NULL)') v, count(*)::int n FROM sources WHERE status='active' GROUP BY 1 ORDER BY 2 DESC`)) console.log(`  ${String(r.v).padEnd(14)} ${r.n}`);

console.log("\n=== THE FINALIZE GAP ===");
const nullRole=(await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND source_role IS NULL`))[0].n;
const nullCat=(await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND category IS NULL`))[0].n;
const lowConf=(await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND classification_confidence IN ('low') `))[0].n;
const noConf=(await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND classification_confidence IS NULL`))[0].n;
const emptyIT=(await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND (intelligence_types IS NULL OR cardinality(intelligence_types)=0)`))[0].n;
console.log(`  NULL source_role:            ${nullRole}`);
console.log(`  NULL category:               ${nullCat}`);
console.log(`  classification_confidence low: ${lowConf}`);
console.log(`  classification_confidence NULL: ${noConf}`);
console.log(`  empty intelligence_types:    ${emptyIT}`);

console.log("\n=== the NULL-source_role active sources (need a definite role) ===");
for(const r of await q(`SELECT left(name,40) name, category, base_tier bt, left(coalesce(replace(url,'https://',''),''),34) url FROM sources WHERE status='active' AND source_role IS NULL ORDER BY category, name`))
  console.log(`  [${String(r.category).padEnd(15)} t${r.bt}] ${String(r.name).padEnd(40)} ${r.url}`);

console.log("\n=== category x source_role coherence (does role match what category implies?) ===");
for(const r of await q(`SELECT category, source_role, count(*)::int n FROM sources WHERE status='active' GROUP BY 1,2 ORDER BY 1,3 DESC`)) console.log(`  ${String(r.category).padEnd(16)} ${String(r.source_role||'(NULL)').padEnd(24)} ${r.n}`);

console.log("\n=== sample intelligence_types arrays (the 'what to pull' field) ===");
for(const r of await q(`SELECT category, intelligence_types, count(*)::int n FROM sources WHERE status='active' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12`)) console.log(`  ${String(r.category).padEnd(16)} {${r.intelligence_types}}  x${r.n}`);
await c.end();
