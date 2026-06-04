/**
 * cell-inventory.mjs — READ-ONLY master inventory: every table, every cell (column),
 * and the empirical update cadence (from timestamps) + write triggers per table.
 * Writes the full column list to docs/audits/supabase-cell-inventory-2026-06-03.md.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
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
try {
  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)).map((r) => r.table_name);
  const allCols = await q(`SELECT table_name, column_name, data_type, is_nullable, ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
  const colsBy = {}; for (const r of allCols) (colsBy[r.table_name] ||= []).push(r);
  // triggers per table
  const trg = await q(`SELECT tgrelid::regclass::text tbl, tgname FROM pg_trigger WHERE NOT tgisinternal`);
  const trgBy = {}; for (const r of trg) (trgBy[r.tbl.replace(/^public\./, "")] ||= []).push(r.tgname);

  // ---- full cell inventory -> markdown file ----
  let md = `# Supabase Cell Inventory — 2026-06-03 (READ-ONLY)\n\n${tables.length} base tables. Every column, type, nullability. Triggers + row count + update cadence per table.\n\n`;
  const cadence = [];
  for (const t of tables) {
    const cols = colsBy[t] || [];
    const names = cols.map((x) => x.column_name);
    const hasC = names.includes("created_at"), hasU = names.includes("updated_at");
    let n = 0; try { n = (await q(`SELECT count(*)::int n FROM "${t}"`))[0].n; } catch {}
    let cad = { t, n, maxU: null, u7: null, u30: null, maxC: null };
    if (hasU && n) { const r = (await q(`SELECT max(updated_at) mx, count(*) FILTER (WHERE updated_at > now()-interval '7 days')::int u7, count(*) FILTER (WHERE updated_at > now()-interval '30 days')::int u30 FROM "${t}"`))[0]; cad.maxU = r.mx; cad.u7 = r.u7; cad.u30 = r.u30; }
    if (hasC && n) { const r = (await q(`SELECT max(created_at) mx FROM "${t}"`))[0]; cad.maxC = r.mx; }
    cadence.push(cad);
    md += `## ${t}  (${n} rows${trgBy[t] ? `, triggers: ${trgBy[t].join(", ")}` : ""})\n`;
    md += cols.map((x) => `- ${x.column_name} \`${x.data_type}\`${x.is_nullable === "NO" ? " NOT NULL" : ""}`).join("\n") + "\n\n";
  }
  writeFileSync(resolve(ROOT, "docs", "audits", "supabase-cell-inventory-2026-06-03.md"), md);
  console.log(`Wrote full cell inventory: docs/audits/supabase-cell-inventory-2026-06-03.md (${tables.length} tables, ${allCols.length} columns)\n`);

  // ---- cadence summary to chat: sorted by most-recent update ----
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const withU = cadence.filter((x) => x.maxU).sort((a, b) => new Date(b.maxU) - new Date(a.maxU));
  const noU = cadence.filter((x) => !x.maxU);
  console.log(`===== UPDATE CADENCE — tables WITH updated_at (${withU.length}), most-recent first =====`);
  console.log(`  table                              rows   last_update  upd<=7d  upd<=30d  triggers`);
  for (const x of withU) console.log(`  ${x.t.padEnd(34)} ${String(x.n).padStart(5)}   ${fmt(x.maxU)}   ${String(x.u7).padStart(5)}   ${String(x.u30).padStart(6)}   ${(trgBy[x.t]||[]).length}`);
  console.log(`\n===== tables WITHOUT updated_at (${noU.length}) — rows + last created =====`);
  console.log(`  table                              rows   last_created  triggers`);
  for (const x of noU.sort((a,b)=>b.n-a.n)) console.log(`  ${x.t.padEnd(34)} ${String(x.n).padStart(5)}   ${fmt(x.maxC).padStart(10)}    ${(trgBy[x.t]||[]).length}`);
  console.log("\nREAD-ONLY.");
} finally { await c.end(); }
