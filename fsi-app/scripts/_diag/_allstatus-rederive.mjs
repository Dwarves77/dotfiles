import pg from "pg";import{readFileSync}from"node:fs";import{resolve,dirname}from"node:path";import{fileURLToPath}from"node:url";
import { classifySourceRole } from "../../src/lib/sources/classify-source-role.ts";
const __d=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(__d,"..","..");process.loadEnvFile(resolve(ROOT,".env.local"));
const ref=readFileSync(resolve(ROOT,"supabase/.temp/project-ref"),"utf8").trim();const pooler=readFileSync(resolve(ROOT,"supabase/.temp/pooler-url"),"utf8").trim();
const CONN=pooler.replace(`postgres.${ref}@`,`postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c=new pg.Client({connectionString:CONN});await c.connect();const q=(s,p)=>c.query(s,p).then(r=>r);
// classify NULL roles on NON-active sources too
const nulls=(await q(`SELECT id,name,url FROM sources WHERE source_role IS NULL`)).rows;
let set=0;for(const s of nulls){const r=classifySourceRole(s.name,s.url);if(!r)continue;await q(`UPDATE sources SET source_role=$2 WHERE id=$1 AND source_role IS NULL`,[s.id,r]);set++;}
// touch ALL sources -> trigger re-derives category+intelligence_types
const t=await q(`UPDATE sources SET source_role=source_role`);
console.log(`classified ${set} more NULL roles (non-active); re-derived ${t.rowCount} total sources`);
console.log("GUIDE remaining (all):", (await q(`SELECT count(*)::int n FROM sources WHERE 'GUIDE'=ANY(intelligence_types)`)).rows[0].n);
console.log("NULL category (all):", (await q(`SELECT count(*)::int n FROM sources WHERE category IS NULL`)).rows[0].n);
console.log("NULL role (all):", (await q(`SELECT count(*)::int n FROM sources WHERE source_role IS NULL`)).rows[0].n);
await c.end();
