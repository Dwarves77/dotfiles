/**
 * apply-120.mjs — close the last two provenance-gate leaks on customer RPCs.
 *
 * The customer read gate (provenance_status='verified') is already live on:
 *   - _workspace_active_items (cascades to dashboard / listings / aggregates / aggregates_scoped)
 *   - get_market_intel_items
 *   - the gated direct reads in supabase-server.ts
 * GAP: get_workspace_intelligence (base) and get_workspace_intelligence_slim read
 * intelligence_items directly with only `WHERE NOT COALESCE(wo.is_archived, ii.is_archived)`
 * and were never gated (migration 117 patched only the base + market, but the live
 * base body had no gate). This closes both by injecting the clause into the LIVE
 * definitions (no hand-reproduction of the huge signatures), writes the resulting
 * CREATE OR REPLACE statements to migration 120 for the durable record, applies them,
 * and verifies the gate is present + the RPCs return 0 rows (all items quarantined now).
 */
import pg from "pg";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));
const PROJECT_REF = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const CONN_STRING = POOLER_URL.replace(`postgres.${PROJECT_REF}@`, `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`);
const MIGRATION_OUT = resolve(FSI_APP_ROOT, "supabase/migrations/120_provenance_gate_remaining_customer_rpcs.sql");

const TARGETS = ["get_workspace_intelligence", "get_workspace_intelligence_slim"];
const ANCHOR = "WHERE NOT COALESCE(wo.is_archived, ii.is_archived)";
const GATE = "\n    AND ii.provenance_status = 'verified' -- migration 120: customer read gate";

const client = new Client({ connectionString: CONN_STRING });
await client.connect();
try {
  const statements = [];
  for (const fn of TARGETS) {
    const d = await client.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname=$1 LIMIT 1", [fn]);
    if (!d.rows.length) { console.log(`[apply-120] ${fn} not found — skip`); continue; }
    let def = d.rows[0].def;
    if (/provenance_status\s*=\s*.verified./.test(def)) { console.log(`[apply-120] ${fn} already gated — skip`); continue; }
    if (!def.includes(ANCHOR)) { console.error(`[apply-120] ANCHOR not found in ${fn} — HALT (manual review).`); process.exit(1); }
    // Inject the gate at the FIRST anchor (the main item filter).
    def = def.replace(ANCHOR, ANCHOR + GATE);
    statements.push(`-- ${fn}\n${def};`);
    await client.query(def);
    console.log(`[apply-120] ${fn} gated + replaced.`);
  }

  if (statements.length) {
    const header = `-- Migration 120: provenance gate on the remaining customer RPCs.\n` +
      `-- Adds AND ii.provenance_status = 'verified' to get_workspace_intelligence (base) and\n` +
      `-- get_workspace_intelligence_slim, which read intelligence_items directly and were the\n` +
      `-- last ungated customer read paths (the dashboard/listings/aggregates family is gated via\n` +
      `-- _workspace_active_items; market via get_market_intel_items). Bodies below are the LIVE\n` +
      `-- definitions with the single gate clause injected after the main WHERE.\n\nBEGIN;\n\n`;
    writeFileSync(MIGRATION_OUT, header + statements.join("\n\n") + "\n\nCOMMIT;\n");
    console.log(`[apply-120] wrote ${MIGRATION_OUT}`);
    const exists = await client.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='120'");
    if (!exists.rows.length) {
      await client.query("INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('120','provenance_gate_remaining_customer_rpcs')");
      console.log("[apply-120] registered 120 in schema_migrations.");
    }
  }
  await client.query("NOTIFY pgrst, 'reload schema'");

  // ── Verify: gate present + RPC returns 0 rows for a real org ──
  console.log("\n── verification ──");
  const org = await client.query("SELECT id FROM public.organizations LIMIT 1");
  const orgId = org.rows[0]?.id;
  for (const fn of TARGETS) {
    const d = await client.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname=$1 LIMIT 1", [fn]);
    const gated = /provenance_status\s*=\s*.verified./.test(d.rows[0].def);
    let rowCount = "n/a";
    if (orgId) {
      try { const r = await client.query(`SELECT count(*)::int AS n FROM public.${fn}($1)`, [orgId]); rowCount = r.rows[0].n; }
      catch (e) { rowCount = `ERR(${e.message.slice(0, 40)})`; }
    }
    console.log(`  ${fn}: gated=${gated}  rows_for_org=${rowCount}  (expect gated=true, rows=0)`);
  }
  console.log("\n[apply-120] DONE.");
} finally {
  await client.end();
}
