/** source-role-cleanup.mjs — #3 source-classification cleanup (authorized 2026-06-04).
 * Re-runs the deterministic classifySourceRole (name+url, no LLM/Browserless — zero cost) over
 * active sources; where it confidently disagrees with the stored source_role, proposes the fix.
 * The migration-123 trigger re-derives category + intelligence_types on UPDATE. Feeds trust
 * scoring + Market's later corroboration-count; routing is now by item_type so surfaces don't move.
 * Guarded: dry-run default; --execute --confirm applies per-row (WHERE source_role=old) + read-back.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySourceRole } from "../src/lib/sources/classify-source-role.ts";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);

try {
  const rows = (await q(`SELECT id, name, url, source_role, category FROM sources WHERE status='active'`)).rows;
  const mism = [];
  for (const s of rows) {
    const proposed = classifySourceRole(s.name, s.url);
    if (proposed && proposed !== s.source_role) mism.push({ ...s, proposed });
  }
  console.log(`active sources: ${rows.length} | confident role mismatches: ${mism.length}\n`);
  // group by transition
  const byT = {}; for (const m of mism) { const k = `${m.source_role} -> ${m.proposed}`; (byT[k] ??= []).push(m); }
  for (const [k, v] of Object.entries(byT).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(v.length).padStart(3)}  ${k}`);
    for (const m of v.slice(0, 3)) console.log(`        e.g. ${(m.name || "").slice(0, 60)}`);
  }
  const ghg = mism.find((m) => /ghg protocol|greenhouse gas protocol/i.test(m.name || ""));
  console.log(`\nGHG Protocol: ${ghg ? `${ghg.source_role} -> ${ghg.proposed} (FIX queued)` : "(no mismatch / not active)"}`);

  if (EXECUTE) {
    let applied = 0, halted = 0;
    for (const m of mism) {
      const u = await q(`UPDATE sources SET source_role=$2 WHERE id=$1 AND source_role IS NOT DISTINCT FROM $3 RETURNING source_role, category`, [m.id, m.proposed, m.source_role]);
      if (u.rowCount === 1 && u.rows[0].source_role === m.proposed) applied++; else { halted++; console.error(`  read-back fail: ${m.id}`); }
    }
    writeFileSync(resolve(__d, "_diag/source-role-cleanup-log.json"), JSON.stringify({ at: "2026-06-04", applied, mismatches: mism.map((m) => ({ id: m.id, name: m.name, from: m.source_role, to: m.proposed })) }, null, 2));
    console.log(`\napplied ${applied}/${mism.length} role fixes (read-back verified; category re-derived by migration-123 trigger). halted=${halted}`);
  } else console.log(`\ndry-run — re-run with --execute --confirm to apply`);
} finally { await c.end(); }
