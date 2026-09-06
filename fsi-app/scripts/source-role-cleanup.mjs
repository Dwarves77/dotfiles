/** source-role-cleanup.mjs — #3 source-classification cleanup (authorized 2026-06-04).
 * Re-runs the deterministic classifySourceRole (name+url, no LLM/Browserless — zero cost) over
 * sources; where it confidently disagrees with the stored source_role, proposes the fix.
 * The migration-123 trigger re-derives category + intelligence_types on UPDATE. Feeds trust
 * scoring + Market's later corroboration-count; routing is now by item_type so surfaces don't move.
 * Guarded: dry-run default; --execute --confirm applies per-row (WHERE source_role=old) + read-back.
 *
 * CONNECTION FIX (lane ONESHOTS, 2026-09-06, rule 13 — fix it now): this script previously hardcoded
 * a LOCAL-ONLY connection path (supabase/.temp/{project-ref,pooler-url}, artifacts of a local
 * `supabase link` that are correctly ABSENT from a fresh CI checkout) with no fallback — an unguarded
 * readFileSync that would ENOENT-crash the moment this ran from GitHub Actions, the ONLY place with DB
 * credentials (per every other MAINT wrapper's own header). Same defect class run-data-audit-lane.mjs's
 * own comment already documents for five other pg-direct audits ("exited 2 on every nightly run...
 * wanted local supabase-link artifacts the workflow never supplied") — fixed there by folding into ONE
 * shared resolver, scripts/lib/pg-conn.mjs (SUPABASE_DB_URL/DATABASE_URL -> local supabase-link ->
 * NEXT_PUBLIC_SUPABASE_URL+SUPABASE_DB_PASSWORD-derived CI candidates). This file now uses that same
 * resolver instead of a fifth private copy of the same connection logic (CLAUDE.md: no copies of
 * logic) — connectPg() returns null when no candidate connects, and this script self-skips (exit 2,
 * "cannot verify here") rather than crashing, the same honest-no-creds convention every other
 * pg-direct tool in this repo uses.
 *
 * REFACTOR (same lane): the read/classify/apply core is now an exported, injectable function
 * (`planAndApply`) so scripts/maintenance/source-role-cleanup.mjs (the maintenance.yml dispatch
 * wrapper) and source-role-cleanup.test.mjs (a fake `query` client, no DB) can both drive it without
 * duplicating the classification logic. Behavior is unchanged — same SQL, same read-back shape.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySourceRole } from "../src/lib/sources/classify-source-role.ts";
// connectPg (scripts/lib/pg-conn.mjs) is imported DYNAMICALLY below, inside the CLI block only — it
// transitively imports the `pg` npm package, and this module's `planAndApply` core must stay importable
// by the no-npm-ci discipline test glob (run-test-suite.sh's own NAMED EXCLUSIONS note documents this
// exact "transitive npm package" trap for batch-primitives.test.mjs; a static top-level import here would
// put source-role-cleanup.test.mjs in the same trap).

const __d = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__d, "..");

/**
 * Pure(ish) core: reads `sources`, computes confident role mismatches, and — under `execute` — applies
 * each fix with a read-back. No file I/O, no process.exit; the CLI wrapper below owns those.
 * @param {{ execute?: boolean, activeOnly?: boolean }} opts
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows: any[], rowCount?: number }> }} deps
 * @returns {Promise<{ totalRows: number, mismatches: Array<object>, byTransition: Record<string, number>,
 *   ghg: object|null, applied: number, halted: number }>}
 */
export async function planAndApply({ execute = false, activeOnly = false } = {}, { query }) {
  // SCOPE FIX (2026-08-11): default scope is EVERY row, not just status='active' — a row is most likely
  // to be missing its role precisely BECAUSE it was demoted/suspended before anyone classified it, and a
  // NULL role is then read downstream as evidence of worthlessness. Roles are an identity property, not
  // a lifecycle property. `activeOnly` restores the old (narrower) scope.
  const rows = (
    await query(`SELECT id, name, url, source_role, category, status FROM sources${activeOnly ? ` WHERE status='active'` : ``}`)
  ).rows;

  const mismatches = [];
  for (const s of rows) {
    const proposed = classifySourceRole(s.name, s.url);
    if (proposed && proposed !== s.source_role) mismatches.push({ ...s, proposed });
  }

  const byTransition = {};
  for (const m of mismatches) {
    const k = `${m.source_role} -> ${m.proposed}`;
    byTransition[k] = (byTransition[k] || 0) + 1;
  }
  const ghgMatch = mismatches.find((m) => /ghg protocol|greenhouse gas protocol/i.test(m.name || ""));
  const ghg = ghgMatch ? { name: ghgMatch.name, from: ghgMatch.source_role, to: ghgMatch.proposed } : null;

  let applied = 0, halted = 0;
  const appliedRows = [];
  if (execute) {
    for (const m of mismatches) {
      const u = await query(
        `UPDATE sources SET source_role=$2 WHERE id=$1 AND source_role IS NOT DISTINCT FROM $3 RETURNING source_role, category`,
        [m.id, m.proposed, m.source_role],
      );
      if (u.rowCount === 1 && u.rows[0].source_role === m.proposed) { applied++; appliedRows.push({ id: m.id, name: m.name, from: m.source_role, to: m.proposed }); }
      else halted++;
    }
  }

  return { totalRows: rows.length, mismatches, byTransition, ghg, applied, halted, appliedRows };
}

// ── CLI (unchanged surface: --execute --confirm to apply, --active-only to narrow scope) ──
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }
  const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
  const ACTIVE_ONLY = process.argv.includes("--active-only");

  const { connectPg } = await import("./lib/pg-conn.mjs");
  const c = await connectPg();
  if (!c) {
    console.error("source-role-cleanup: no working Postgres connection (SUPABASE_DB_URL/DATABASE_URL, a local `supabase link`, or NEXT_PUBLIC_SUPABASE_URL+SUPABASE_DB_PASSWORD) — cannot verify here (exit 2).");
    process.exit(2);
  }
  try {
    const q = (s, p) => c.query(s, p);
    const r = await planAndApply({ execute: EXECUTE, activeOnly: ACTIVE_ONLY }, { query: q });
    console.log(`${ACTIVE_ONLY ? "active" : "all"} sources: ${r.totalRows} | confident role mismatches: ${r.mismatches.length}\n`);
    for (const [k, n] of Object.entries(r.byTransition).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${k}`);
      for (const m of r.mismatches.filter((mm) => `${mm.source_role} -> ${mm.proposed}` === k).slice(0, 3)) console.log(`        e.g. ${(m.name || "").slice(0, 60)}`);
    }
    console.log(`\nGHG Protocol: ${r.ghg ? `${r.ghg.from} -> ${r.ghg.to} (FIX queued)` : "(no mismatch / not in scope)"}`);
    if (EXECUTE) {
      mkdirSync(resolve(__d, "_diag"), { recursive: true });
      writeFileSync(resolve(__d, "_diag/source-role-cleanup-log.json"), JSON.stringify({ at: new Date().toISOString(), applied: r.applied, mismatches: r.appliedRows }, null, 2));
      console.log(`\napplied ${r.applied}/${r.mismatches.length} role fixes (read-back verified; category re-derived by migration-123 trigger). halted=${r.halted}`);
    } else console.log(`\ndry-run — re-run with --execute --confirm to apply`);
  } finally { await c.end(); }
}
