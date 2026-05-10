/**
 * _phase2-step1-task6-inserts.mjs
 * Execute Task 6 INSERTs from scripts/tmp/task6-inserts-v2.sql.
 * Uses pg directly (set-of-INSERT statements wrapped in a transaction).
 * Surfaces row count post-insert.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const PROJECT_REF = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD missing"); process.exit(1); }
const CONN = POOLER_URL.replace(`postgres.${PROJECT_REF}@`, `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`);

const sql = readFileSync(resolve(FSI_APP_ROOT, "scripts/tmp/task6-inserts-v2.sql"), "utf8");

// Strip the leading existence-check log noise; keep only from "BEGIN;" onward
const sqlStart = sql.indexOf("BEGIN;");
if (sqlStart < 0) { console.error("Could not find BEGIN; in SQL file"); process.exit(2); }
const cleanSql = sql.slice(sqlStart);

// Pre-count
const { Client } = pg;
const c = new Client({ connectionString: CONN });
await c.connect();

const { rows: pre } = await c.query("SELECT COUNT(*) AS n FROM sources");
console.log("[step1] sources count BEFORE: " + pre[0].n);

console.log("[step1] executing Task 6 INSERTs (transactional, ON CONFLICT DO NOTHING)");
try {
  await c.query(cleanSql);
  console.log("[step1] SQL block executed");
} catch (e) {
  console.error("[step1] FAIL: " + e.message);
  try { await c.query("ROLLBACK"); } catch {}
  await c.end();
  process.exit(3);
}

// Need explicit COMMIT? The cleanSql ends with "-- COMMIT or ROLLBACK." comment, no actual COMMIT.
// pg.query treats each statement; the BEGIN starts a transaction that must be COMMITTed.
await c.query("COMMIT");
console.log("[step1] COMMIT issued");

const { rows: post } = await c.query("SELECT COUNT(*) AS n FROM sources");
console.log("[step1] sources count AFTER: " + post[0].n);
console.log("[step1] delta: " + (parseInt(post[0].n) - parseInt(pre[0].n)));

// Verify the 11 specific URLs landed with correct classification
const targetUrls = [
  "https://finance.ec.europa.eu/",
  "https://www.esma.europa.eu/",
  "https://www.eba.europa.eu/",
  "https://www.fca.org.uk/",
  "https://www.sec.gov/",
  "https://carbon-pulse.com/",
  "https://galleryclimatecoalition.org/about/",
  "https://galleryclimatecoalition.org/research/",
  "https://www.aam-us.org/",
  "https://www.icom-cc.org/",
  "https://www.iiconservation.org/",
];
const { rows: inserted } = await c.query(
  "SELECT id, name, url, source_role, tier, jurisdictions, scope_verticals, expected_output, auto_run_enabled FROM sources WHERE url = ANY($1::text[]) ORDER BY url",
  [targetUrls]
);
console.log("[step1] inserted rows confirmed (" + inserted.length + "/" + targetUrls.length + "):");
for (const r of inserted) {
  console.log("  " + r.id + " | " + r.url + " | role=" + r.source_role + " tier=" + r.tier + " auto=" + r.auto_run_enabled + " verticals=" + JSON.stringify(r.scope_verticals));
}

await c.end();

if (inserted.length !== targetUrls.length) {
  console.error("[step1] HALT: inserted count mismatch");
  process.exit(4);
}
console.log("[step1] PASS");
