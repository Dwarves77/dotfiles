/** apply-122-institutions.mjs — apply migration 122 (institutions table + sources.institution_id FK). Idempotent. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const SQL = readFileSync(resolve(ROOT, "supabase/migrations/122_source_institutions.sql"), "utf8");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  await c.query(SQL);
  if (!(await c.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='122'")).rows.length)
    await c.query("INSERT INTO supabase_migrations.schema_migrations (version,name) VALUES ('122','source_institutions')");
  await c.query("NOTIFY pgrst, 'reload schema'");
  const tbl = (await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='institutions'`)).rows.length;
  const col = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name='sources' AND column_name='institution_id'`)).rows.length;
  console.log(`[apply-122] applied. institutions table: ${tbl ? "OK" : "MISSING"}; sources.institution_id: ${col ? "OK" : "MISSING"}`);
} finally { await c.end(); }
