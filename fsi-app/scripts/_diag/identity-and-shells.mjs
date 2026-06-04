/** identity-and-shells.mjs — READ-ONLY: (1) how is regulation identity stored? (2) why do empty shells exist? */
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
  // ---- Q1: is there a canonical regulation-identity column, and is it populated? ----
  console.log("===== Q1: regulation-identity storage on intelligence_items =====\n");
  const { rows: cols } = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='intelligence_items'
      AND (column_name ILIKE ANY (ARRAY['%instrument%','%celex%','%eli%','%regulation%','%identifier%','%number%','%cite%','%legal%']))
    ORDER BY column_name`);
  console.log("identity-ish columns:");
  for (const c2 of cols) console.log(`  ${c2.column_name} (${c2.data_type})`);
  // population of the most likely identity columns
  for (const col of cols.map((x) => x.column_name)) {
    const { rows } = await c.query(`SELECT count(*)::int total, count(${col})::int nonnull, count(*) FILTER (WHERE is_archived=false)::int active FROM intelligence_items`);
    const { rows: an } = await c.query(`SELECT count(${col})::int nn FROM intelligence_items WHERE is_archived=false`);
    console.log(`  populated: ${col} -> ${rows[0].nonnull}/${rows[0].total} all, ${an[0].nn}/${rows[0].active} active`);
  }
  // sample the two known + an HDV item: title vs source_url vs any identity col
  const idCol = cols.find((x) => /instrument_identifier|celex|^eli|regulation_number/i.test(x.column_name))?.column_name;
  console.log(`\n  best identity column candidate: ${idCol || "(none)"}`);
  if (idCol) {
    const { rows } = await c.query(`SELECT substring(id::text,1,8) sid, legacy_id, ${idCol} AS ident, source_url FROM intelligence_items WHERE substring(id::text,1,8) IN ('62ba40b0','6f1e6615','b7736a1a')`);
    for (const r of rows) console.log(`    ${r.sid} ${r.legacy_id||""}  ${idCol}='${r.ident ?? "NULL"}'  src=${r.source_url}`);
  }

  // ---- Q2: empty shells — count, why, origin ----
  console.log("\n===== Q2: empty shells (active, no full_brief, no sections) =====\n");
  const shellPred = `is_archived=false AND COALESCE(full_brief,'')='' AND NOT EXISTS (SELECT 1 FROM intelligence_item_sections s WHERE s.item_id=intelligence_items.id AND COALESCE(s.content_md,'')<>'')`;
  const { rows: tot } = await c.query(`SELECT count(*)::int n FROM intelligence_items WHERE ${shellPred}`);
  console.log(`empty shells (active): ${tot[0].n}`);
  const dist = async (label, expr) => { const { rows } = await c.query(`SELECT ${expr} k, count(*)::int n FROM intelligence_items WHERE ${shellPred} GROUP BY 1 ORDER BY 2 DESC`); console.log(`\n  by ${label}:`); for (const r of rows) console.log(`    ${r.k ?? "NULL"}: ${r.n}`); };
  await dist("provenance_status", "provenance_status");
  await dist("item_type", "item_type");
  await dist("origin (legacy_id null=scan-discovered / set=seed)", "(legacy_id IS NULL)");
  await dist("regeneration_skill_version (null=never generated)", "regeneration_skill_version");
  await dist("created month", "to_char(created_at,'YYYY-MM')");
  // has a source + source_url? (could it even be generated?)
  const { rows: gen } = await c.query(`SELECT count(*) FILTER (WHERE source_id IS NOT NULL)::int has_src, count(*) FILTER (WHERE COALESCE(source_url,'')<>'')::int has_url, count(*)::int n FROM intelligence_items WHERE ${shellPred}`);
  console.log(`\n  generatable? has source_id ${gen[0].has_src}/${gen[0].n} | has source_url ${gen[0].has_url}/${gen[0].n}`);
  // any failed-generation signal: updated_at != created_at (touched but still empty)?
  const { rows: touched } = await c.query(`SELECT count(*) FILTER (WHERE updated_at > created_at + interval '1 minute')::int touched, count(*)::int n FROM intelligence_items WHERE ${shellPred}`);
  console.log(`  touched after creation (updated_at>created_at): ${touched[0].touched}/${touched[0].n}  (high => generation attempted & left empty; low => never attempted)`);
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
