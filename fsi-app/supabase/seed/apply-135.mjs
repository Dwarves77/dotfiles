/**
 * apply-135.mjs — apply the source-registration DB guard (migration 135) + fire-test it live.
 *
 * Migration 135 creates _url_host(), _guard_source_archive(), and a BEFORE INSERT/UPDATE trigger on
 * intelligence_items that REFUSES to archive a row with a source-y archive_reason unless a registered
 * ACTIVE source exists for its host. This is the durable DB twin of rule 019 + db.mjs reclassifyToSource
 * + orphan-source-audit. Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
 *
 * Precondition (verified): orphan-source-audit reports 0 — no pre-existing violation to trip on.
 * Verification (real DB, rolled back — nothing persisted):
 *   - functions + trigger exist after apply
 *   - FIRE-TEST BAD : archive-as-source with an UNREGISTERED host must RAISE (trigger blocks it)
 *   - FIRE-TEST GOOD: archive-as-source with a REGISTERED active host must SUCCEED
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const SQL = readFileSync(resolve(ROOT, "supabase/migrations/135_source_registration_guard.sql"), "utf8");

const client = new Client({ connectionString: CONN });
await client.connect();
try {
  // ── apply (auto-committed DDL) ──
  await client.query(SQL);
  const reg = await client.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='135'");
  if (!reg.rows.length) await client.query("INSERT INTO supabase_migrations.schema_migrations (version,name) VALUES ('135','source_registration_guard')");
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log("[apply-135] DDL applied + registered.");

  // ── VERIFY existence ──
  const fns = (await client.query(
    "SELECT proname FROM pg_proc WHERE proname IN ('_url_host','_guard_source_archive') ORDER BY proname")).rows.map((r) => r.proname);
  const trg = (await client.query(
    "SELECT tgname FROM pg_trigger WHERE tgname='trg_guard_source_archive' AND NOT tgisinternal")).rows.map((r) => r.tgname);
  console.log(`[verify] functions: ${fns.join(", ") || "NONE"}  | trigger: ${trg.join(", ") || "NONE"}`);

  // pick test rows + a known active source host
  const testId = (await client.query("SELECT id FROM public.intelligence_items WHERE is_archived=false LIMIT 1")).rows[0]?.id;
  const goodUrl = (await client.query("SELECT url FROM public.sources WHERE status='active' AND url ~ '^https?://' LIMIT 1")).rows[0]?.url;

  // ── FIRE-TEST BAD: unregistered host must be blocked ──
  let blocked = false, bmsg = "";
  await client.query("BEGIN");
  try {
    await client.query(
      "UPDATE public.intelligence_items SET is_archived=true, archive_reason='source_not_item', source_url='https://bogus-unregistered-host-xyz.invalid/' WHERE id=$1", [testId]);
  } catch (e) { blocked = true; bmsg = e.message; }
  await client.query("ROLLBACK");
  console.log(`[fire-test BAD ] archive-as-source w/ unregistered host: ${blocked ? "BLOCKED ✓" : "NOT BLOCKED ✗"}${bmsg ? "  (" + bmsg.split("\n")[0].slice(0, 70) + ")" : ""}`);

  // ── FIRE-TEST GOOD: registered active host must pass ──
  let allowed = true, gmsg = "";
  await client.query("BEGIN");
  try {
    await client.query(
      "UPDATE public.intelligence_items SET is_archived=true, archive_reason='reclassified_to_source', source_url=$2 WHERE id=$1", [testId, goodUrl]);
  } catch (e) { allowed = false; gmsg = e.message; }
  await client.query("ROLLBACK");
  console.log(`[fire-test GOOD] archive-as-source w/ registered host (${goodUrl?.slice(0, 40)}): ${allowed ? "ALLOWED ✓" : "WRONGLY BLOCKED ✗ (" + gmsg.slice(0, 60) + ")"}`);

  const ok = fns.length === 2 && trg.length === 1 && blocked && allowed;
  console.log(`\n${ok ? "PASS — migration 135 live; guard blocks unregistered archive-as-source, allows registered." : "FAIL — see flags above."}`);
  process.exit(ok ? 0 : 1);
} finally {
  await client.end();
}
