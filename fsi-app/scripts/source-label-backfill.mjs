/**
 * source-label-backfill.mjs — guarded data-op. (1) Classifies the NULL source_roles via
 * classify-source-role.ts (keeps existing roles untouched). (2) Touches every active source so
 * the migration-123 trigger re-derives category + intelligence_types from source_role+name
 * (fixes category drift, kills the ['GUIDE'] placeholder). dry-run default (--execute --confirm).
 * Reversible: role classifications logged; category/intelligence_types are trigger-derived
 * (drop the 123 trigger to stop deriving). source_role of already-classified sources NOT changed.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySourceRole } from "../src/lib/sources/classify-source-role.ts";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);
const dist = async (col) => (await q(`SELECT coalesce(${col}::text,'(NULL)') v, count(*)::int n FROM sources WHERE status='active' GROUP BY 1 ORDER BY 2 DESC`)).rows.map((r) => `${r.v}=${r.n}`).join("  ");
const log = { mode: EXECUTE ? "EXECUTE" : "DRY-RUN", roleSet: [], unresolvedRole: [] };
try {
  console.log("=== BEFORE ===");
  console.log("  category:", await dist("category"));
  console.log("  guide-count:", (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND 'GUIDE'=ANY(intelligence_types)`)).rows[0].n);

  // 1. classify the NULL source_roles (do NOT touch existing roles)
  const nulls = (await q(`SELECT id, name, url FROM sources WHERE status='active' AND source_role IS NULL`)).rows;
  let roleSet = 0;
  for (const s of nulls) {
    const role = classifySourceRole(s.name, s.url);
    if (!role) { log.unresolvedRole.push({ id: s.id, name: s.name }); continue; }
    if (EXECUTE) {
      const u = await q(`UPDATE sources SET source_role=$2 WHERE id=$1 AND source_role IS NULL RETURNING source_role`, [s.id, role]);
      if (u.rowCount !== 1 || u.rows[0].source_role !== role) { console.error(`  HALT: role set failed ${s.id}`); break; }
    }
    roleSet++; log.roleSet.push({ id: s.id, name: s.name, role });
  }
  console.log(`\n  NULL roles classified: ${roleSet} / ${nulls.length}   undeterminable (left NULL, flagged): ${log.unresolvedRole.length}`);

  // 2. touch every active source -> trigger re-derives category + intelligence_types
  if (EXECUTE) {
    const t = await q(`UPDATE sources SET source_role = source_role WHERE status='active'`);
    console.log(`  re-derived (touched) ${t.rowCount} active sources via the 123 trigger`);
  } else {
    console.log(`  WOULD touch all active sources to re-derive category + intelligence_types`);
  }

  console.log("\n=== AFTER ===");
  console.log("  category:", await dist("category"));
  console.log("  intelligence_types:", await dist("array_to_string(intelligence_types,',')"));
  console.log("  guide-count:", (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND 'GUIDE'=ANY(intelligence_types)`)).rows[0].n);
  console.log("  NULL source_role remaining:", (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND source_role IS NULL`)).rows[0].n);
  console.log("  NULL category remaining:", (await q(`SELECT count(*)::int n FROM sources WHERE status='active' AND category IS NULL`)).rows[0].n);

  if (log.unresolvedRole.length) { console.log("\n  undeterminable roles (flagged):"); for (const u of log.unresolvedRole.slice(0,10)) console.log(`    ${u.id.slice(0,8)} ${String(u.name).slice(0,44)}`); }
  writeFileSync(resolve(__dirname, "_diag", "source-label-backfill-log.json"), JSON.stringify(log, null, 0));
  console.log(`\n  ledger -> scripts/_diag/source-label-backfill-log.json`);
  console.log(EXECUTE ? "\n  DONE (executed)." : "\n  DRY-RUN only. Re-run with --execute --confirm.");
} finally { await c.end(); }
