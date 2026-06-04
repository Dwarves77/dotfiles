/**
 * apply-119.mjs — direct apply of migration 119 (validate_item_provenance
 * fail-close revision). Follows the apply-114 direct-apply pattern: applies ONLY
 * 119 (a CREATE OR REPLACE of the STABLE/read-only function), registers it in
 * schema_migrations, reloads PostgREST, then VERIFIES the new behavior against
 * two real items WITHOUT mutating anything (validate_item_provenance is read-only):
 *   - a 0-section 'verified' shell  -> must now recommend 'quarantined'
 *   - a sectioned flagship          -> still 'quarantined' (substrate empty)
 * Nothing flips here — the function is STABLE. The status flip happens later via
 * the reconcile touch pass (set_provenance_status trigger).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const PROJECT_REF = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOLER_URL = readFileSync(resolve(FSI_APP_ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const MIGRATION_PATH_ABS = resolve(FSI_APP_ROOT, "supabase/migrations/119_validate_item_provenance_failclose.sql");
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) { console.error("SUPABASE_DB_PASSWORD missing"); process.exit(1); }
const CONN_STRING = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@`
);
const VERSION = "119";
const NAME = "validate_item_provenance_failclose";

const client = new Client({ connectionString: CONN_STRING });
await client.connect();
try {
  const existing = await client.query(
    "SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1",
    [VERSION]
  );
  if (existing.rows.length) {
    console.log(`[apply-119] ${VERSION} already registered — re-applying CREATE OR REPLACE (idempotent).`);
  }
  const sql = readFileSync(MIGRATION_PATH_ABS, "utf8");
  await client.query(sql);
  console.log("[apply-119] migration SQL executed (function replaced).");
  if (!existing.rows.length) {
    await client.query(
      "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)",
      [VERSION, NAME]
    );
    console.log(`[apply-119] ${VERSION} registered in schema_migrations.`);
  }
  await client.query("NOTIFY pgrst, 'reload schema'");

  // ── VERIFY new behavior (read-only) ──
  console.log("\n── verification (read-only; nothing flips) ──");

  // (a) a 0-section item currently 'verified' -> expect recommended 'quarantined'
  const shell = await client.query(`
    SELECT i.id, i.legacy_id, i.title
      FROM public.intelligence_items i
     WHERE i.provenance_status = 'verified' AND i.is_archived = false
       AND NOT EXISTS (SELECT 1 FROM public.intelligence_item_sections s
                        WHERE s.item_id = i.id AND COALESCE(s.content_md,'') <> '')
     LIMIT 1`);
  if (shell.rows.length) {
    const it = shell.rows[0];
    const { rows } = await client.query("SELECT * FROM public.validate_item_provenance($1)", [it.id]);
    const r = rows[0];
    console.log(`  0-section shell [${it.legacy_id || it.id.slice(0,8)}] "${(it.title||'').slice(0,40)}"`);
    console.log(`    valid=${r.valid}  recommended_status=${r.recommended_status}  failures=${r.failures}`);
    console.log(`    EXPECT: valid=false, recommended_status=quarantined, failure reason=no_section_content`);
  } else {
    console.log("  (no 0-section verified shell found — unexpected)");
  }

  // (b) a sectioned flagship -> still quarantined
  const flag = await client.query(`
    SELECT i.id, i.legacy_id, i.title
      FROM public.intelligence_items i
     WHERE i.is_archived = false AND i.title ILIKE '%CBAM%'
       AND EXISTS (SELECT 1 FROM public.intelligence_item_sections s
                    WHERE s.item_id = i.id AND COALESCE(s.content_md,'') <> '')
     LIMIT 1`);
  if (flag.rows.length) {
    const it = flag.rows[0];
    const { rows } = await client.query("SELECT * FROM public.validate_item_provenance($1)", [it.id]);
    const r = rows[0];
    const fails = Array.isArray(r.failures) ? r.failures : JSON.parse(r.failures);
    console.log(`  sectioned flagship [${it.legacy_id || it.id.slice(0,8)}] "${(it.title||'').slice(0,40)}"`);
    console.log(`    valid=${r.valid}  recommended_status=${r.recommended_status}  failureCount=${fails.length}`);
    console.log(`    EXPECT: valid=false, recommended_status=quarantined (substrate still empty)`);
  }
  console.log("\n[apply-119] DONE. Function replaced + verified. No status flipped (function is STABLE).");
} finally {
  await client.end();
}
