/** ingestion-state-readers.mjs — READ-ONLY: every function/view/trigger body + matview
 * that references ingestion_state, plus its columns. Resolves reader count definitively. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r.rows);
const T = "ingestion_state";
try {
  console.log(`===== columns of ${T} =====`);
  for (const r of await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [T]))
    console.log(`  ${r.column_name.padEnd(26)} ${r.data_type}${r.is_nullable==='NO'?' NOT NULL':''}`);

  console.log(`\n===== function/proc bodies referencing ${T} =====`);
  const fns = await q(`SELECT p.proname, pg_get_functiondef(p.oid) src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`);
  let hitF=0;
  for (const f of fns) if (new RegExp(`\\b${T}\\b`,'i').test(f.src)) {
    hitF++; const isW=/insert\s+into\s+(public\.)?ingestion_state|update\s+(public\.)?ingestion_state|delete\s+from\s+(public\.)?ingestion_state/i.test(f.src);
    const isR=/(from|join)\s+(public\.)?ingestion_state/i.test(f.src);
    console.log(`  fn ${f.proname}  ${isW?'[WRITES]':''}${isR?'[READS]':''}`);
  }
  if(!hitF) console.log("  (none)");

  console.log(`\n===== views / matviews referencing ${T} =====`);
  const vs = await q(`SELECT table_name, view_definition FROM information_schema.views WHERE table_schema='public'`);
  let hitV=0; for (const v of vs) if (new RegExp(`\\b${T}\\b`,'i').test(v.view_definition||'')) { hitV++; console.log(`  view ${v.table_name}`); }
  const mvs = await q(`SELECT matviewname, definition FROM pg_matviews WHERE schemaname='public'`).catch(()=>[]);
  for (const v of mvs) if (new RegExp(`\\b${T}\\b`,'i').test(v.definition||'')) { hitV++; console.log(`  matview ${v.matviewname}`); }
  if(!hitV) console.log("  (none)");

  console.log(`\n===== triggers whose function body touches ${T} =====`);
  const trg = await q(`SELECT t.tgname, t.tgrelid::regclass::text tbl, p.proname fn, pg_get_functiondef(p.oid) src FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal`);
  let hitT=0; for (const r of trg) if (new RegExp(`\\b${T}\\b`,'i').test(r.src)) { hitT++; console.log(`  trigger ${r.tgname} on ${r.tbl} (fn ${r.fn})`); }
  if(!hitT) console.log("  (none)");

  console.log(`\n===== row sample (auto_run/pause-relevant cols) =====`);
  try { for (const r of await q(`SELECT * FROM ${T} LIMIT 3`)) console.log("  "+JSON.stringify(r)); } catch(e){ console.log("  "+e.message); }
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
