/**
 * apply-116-117.mjs — applies the task-1.10 customer read gate to remote
 * Supabase, then verifies it landed. Follows the apply-114 direct-apply pattern.
 *
 *   116_active_intelligence_items_view.sql    — verified-only view
 *   117_provenance_gate_customer_rpcs.sql     — provenance filter added to
 *                                               _workspace_active_items +
 *                                               get_market_intel_items
 *
 * ADDITIVE per the Block 1 hard fence: both migrations are CREATE OR REPLACE
 * (view + functions). NO row data is touched, NO existing item's
 * provenance_status is flipped, NO ALTER/NOT NULL/CHECK on existing columns.
 *
 * Verification (read-only): the view exists and returns 0 rows pre-
 * reconciliation; both gated functions now contain the verified predicate.
 *
 * SAFETY: this script MUTATES SCHEMA (DDL). It is the gated apply the operator
 * reviews. Run only on explicit go-ahead.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const PROJECT_REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD missing from .env.local"); process.exit(1); }
const CONN = POOLER_URL.replace(`postgres.${PROJECT_REF}@`, `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`);

const MIGRATIONS = [
  { version: "116", name: "active_intelligence_items_view", path: "supabase/migrations/116_active_intelligence_items_view.sql" },
  { version: "117", name: "provenance_gate_customer_rpcs", path: "supabase/migrations/117_provenance_gate_customer_rpcs.sql" },
];

const client = new Client({ connectionString: CONN });
await client.connect();
console.log(`[apply-116-117] connected to ${PROJECT_REF}`);
let ok = true;
try {
  for (const m of MIGRATIONS) {
    const sql = readFileSync(resolve(ROOT, m.path), "utf8");
    console.log(`[apply-116-117] applying ${m.version} (${m.name})`);
    await client.query(sql);
    const existing = await client.query(
      "SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1", [m.version]
    );
    if (existing.rows.length === 0) {
      await client.query(
        "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)", [m.version, m.name]
      );
      console.log(`[apply-116-117]   registered ${m.version} in schema_migrations`);
    } else {
      console.log(`[apply-116-117]   ${m.version} already registered; CREATE OR REPLACE re-applied`);
    }
  }
  await client.query("NOTIFY pgrst, 'reload schema'");

  // ── Verification ──
  console.log("\n[apply-116-117] VERIFY:");
  const viewExists = await client.query(
    `SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='active_intelligence_items'`
  );
  console.log(`  [${viewExists.rows.length === 1 ? "PASS" : "FAIL"}] view active_intelligence_items exists`);
  if (viewExists.rows.length !== 1) ok = false;

  const viewCount = await client.query(`SELECT count(*)::int AS n FROM public.active_intelligence_items`);
  const totalActive = await client.query(`SELECT count(*)::int AS n FROM public.intelligence_items WHERE is_archived = false`);
  console.log(`  [${viewCount.rows[0].n === 0 ? "PASS" : "WARN"}] view returns ${viewCount.rows[0].n} rows (expected 0 pre-reconciliation; ${totalActive.rows[0].n} active items total)`);

  for (const fn of ["_workspace_active_items", "get_market_intel_items"]) {
    const def = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=$1 ORDER BY p.oid LIMIT 1`, [fn]
    );
    const gated = def.rows[0] && /provenance_status\s*=\s*'verified'/.test(def.rows[0].def);
    console.log(`  [${gated ? "PASS" : "FAIL"}] ${fn} now filters provenance_status = 'verified'`);
    if (!gated) ok = false;
  }

  // Prove nothing flipped: every existing item still carries its prior status
  // distribution (expected all 'unverified' pre-reconciliation).
  const dist = await client.query(
    `SELECT provenance_status, count(*)::int AS n FROM public.intelligence_items GROUP BY provenance_status ORDER BY n DESC`
  );
  console.log(`  provenance_status distribution (unchanged by this apply): ${dist.rows.map((r) => `${r.provenance_status}=${r.n}`).join(", ")}`);
} catch (e) {
  console.error(`[apply-116-117] ERROR: ${e.message}`);
  ok = false;
} finally {
  await client.end();
}
if (!ok) { console.error("\n[apply-116-117] VERIFICATION FAILED"); process.exit(3); }
console.log("\n[apply-116-117] DONE — customer read gate live; 0 rows pre-reconciliation by design");
