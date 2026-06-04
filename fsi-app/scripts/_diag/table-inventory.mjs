/** table-inventory.mjs — READ-ONLY: list all public tables with column count + row count. */
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
const c = new pg.Client({ connectionString: CONN });
await c.connect();
try {
  const { rows: tbls } = await c.query(`
    SELECT t.table_name,
      (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema='public' AND col.table_name=t.table_name)::int AS cols
    FROM information_schema.tables t
    WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
    ORDER BY t.table_name`);
  console.log(`=== ${tbls.length} public base tables ===\n`);
  const out = [];
  for (const t of tbls) {
    let n = null;
    try {
      const { rows } = await c.query(`SELECT count(*)::int n FROM public.${t.table_name}`);
      n = rows[0].n;
    } catch (e) { n = `ERR:${e.message.slice(0,40)}`; }
    out.push({ table: t.table_name, cols: t.cols, rows: n });
  }
  out.sort((a,b)=> (typeof b.rows==='number'?b.rows:-1) - (typeof a.rows==='number'?a.rows:-1));
  for (const r of out) console.log(`${String(r.rows).padStart(8)}  ${String(r.cols).padStart(3)}c  ${r.table}`);

  // triggers
  console.log(`\n=== triggers (public) ===`);
  const { rows: trg } = await c.query(`
    SELECT event_object_table tbl, trigger_name, action_timing, string_agg(event_manipulation,'/') ev
    FROM information_schema.triggers WHERE trigger_schema='public'
    GROUP BY 1,2,3 ORDER BY 1,2`);
  for (const t of trg) console.log(`  ${t.tbl}: ${t.trigger_name} (${t.action_timing} ${t.ev})`);

  // max updated_at / created_at per reconciliation-core table to spot staleness
  console.log(`\n=== freshness (max created_at / updated_at where present) ===`);
  const core = ['intelligence_items','sources','provisional_sources','staged_updates','monitoring_queue','source_trust_events','item_changelog','intelligence_changes','item_timelines','intelligence_item_sections','section_claim_provenance','agent_run_searches','workspace_settings','workspace_item_overrides','integrity_flags','intelligence_summaries','agent_runs','source_citations','canonical_source_candidates','admin_action_cooldowns','system_state'];
  for (const tbl of core) {
    try {
      const { rows: cc } = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[tbl]);
      const names = cc.map(x=>x.column_name);
      if (names.length===0) { console.log(`  ${tbl}: (absent)`); continue; }
      const parts=[];
      if (names.includes('created_at')) parts.push(`max(created_at) cmax`);
      if (names.includes('updated_at')) parts.push(`max(updated_at) umax`);
      if (parts.length===0) { console.log(`  ${tbl}: (no created_at/updated_at)`); continue; }
      const { rows } = await c.query(`SELECT count(*)::int n, ${parts.join(', ')} FROM public.${tbl}`);
      console.log(`  ${tbl}: n=${rows[0].n} cmax=${rows[0].cmax?.toISOString?.()||rows[0].cmax||'-'} umax=${rows[0].umax?.toISOString?.()||rows[0].umax||'-'}`);
    } catch(e){ console.log(`  ${tbl}: ERR ${e.message.slice(0,50)}`); }
  }
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
