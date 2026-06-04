/** recon-gapfill.mjs — READ-ONLY: inventory + create-path constraints + provenance-freshness trigger. */
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
try {
  // ---- A0: table inventory (rows + column count) ----
  console.log("===== A0 INVENTORY: public tables (cols / rows) =====");
  const { rows: tbls } = await c.query(`
    SELECT t.table_name,
      (SELECT count(*) FROM information_schema.columns c WHERE c.table_name=t.table_name AND c.table_schema='public')::int ncol
    FROM information_schema.tables t WHERE t.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY t.table_name`);
  for (const t of tbls) {
    let n = "?"; try { const r = await c.query(`SELECT count(*)::int n FROM "${t.table_name}"`); n = r.rows[0].n; } catch {}
    console.log(`  ${t.table_name.padEnd(34)} cols=${String(t.ncol).padStart(3)}  rows=${n}`);
  }

  // ---- A8: create-path — nullability of content/identity columns on intelligence_items ----
  console.log("\n===== A8 CREATE-PATH: intelligence_items key-column nullability + CHECK constraints =====");
  const { rows: nul } = await c.query(`
    SELECT column_name, is_nullable, data_type FROM information_schema.columns
    WHERE table_name='intelligence_items' AND column_name IN
      ('title','full_brief','source_id','source_url','provenance_status','instrument_identifier','priority','severity','item_type')
    ORDER BY column_name`);
  for (const r of nul) console.log(`  ${r.column_name.padEnd(22)} nullable=${r.is_nullable}  (${r.data_type})`);
  const { rows: chk } = await c.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) def FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid WHERE rel.relname='intelligence_items' AND con.contype='c'`);
  console.log(`  CHECK constraints: ${chk.length ? "" : "(none)"}`);
  for (const r of chk) console.log(`    ${r.conname}: ${r.def}`);

  // ---- A5: provenance-freshness — triggers on intelligence_items + the function bodies ----
  console.log("\n===== A5 PROVENANCE FRESHNESS: triggers on intelligence_items =====");
  const { rows: trg } = await c.query(`
    SELECT tgname, pg_get_triggerdef(oid) def FROM pg_trigger
    WHERE tgrelid='intelligence_items'::regclass AND NOT tgisinternal ORDER BY tgname`);
  for (const t of trg) console.log(`  ${t.tgname}\n    ${t.def}`);
  // does set_provenance_status re-derive on content change? print its body (trimmed)
  const { rows: fn } = await c.query(`SELECT pg_get_functiondef('set_provenance_status'::regproc) src`).catch(() => ({ rows: [] }));
  if (fn[0]) {
    const body = fn[0].src;
    console.log("\n  set_provenance_status() body (key lines):");
    for (const line of body.split("\n")) if (/WHEN|provenance_status|validate_item_provenance|full_brief|NEW\.|OLD\.|RETURN|IF |ELSE/.test(line)) console.log("    " + line.trim().slice(0, 130));
  }
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
