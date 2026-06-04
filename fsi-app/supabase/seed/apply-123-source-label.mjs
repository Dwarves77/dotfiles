/** apply-123-source-label.mjs — apply migration 123 (label-derivation functions + trigger). Idempotent. */
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
const SQL = readFileSync(resolve(ROOT, "supabase/migrations/123_source_label_derivation.sql"), "utf8");
const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  await c.query(SQL);
  if (!(await c.query("SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='123'")).rows.length)
    await c.query("INSERT INTO supabase_migrations.schema_migrations (version,name) VALUES ('123','source_label_derivation')");
  await c.query("NOTIFY pgrst, 'reload schema'");
  // verify the derivation function matches migration 084 + the trigger exists
  const checks = [
    ["primary_legal_authority -> regulatory", "SELECT public.derive_source_category('primary_legal_authority','X')='regulatory' ok"],
    ["academic_research -> research",          "SELECT public.derive_source_category('academic_research','MIT')='research' ok"],
    ["industry_association -> market_news",     "SELECT public.derive_source_category('industry_association','SAFA')='market_news' ok"],
    ["IMO name exception -> regulatory",        "SELECT public.derive_source_category('intergovernmental_body','International Maritime Organization')='regulatory' ok"],
    ["regulatory -> {regulation}",             "SELECT public.derive_source_intelligence_types('regulatory')=ARRAY['regulation'] ok"],
  ];
  for (const [label, sql] of checks) console.log(`  ${(await c.query(sql)).rows[0].ok ? "OK" : "FAIL"}  ${label}`);
  const trg = (await c.query("SELECT 1 FROM pg_trigger WHERE tgname='set_source_label_trg'")).rows.length;
  console.log(`  trigger set_source_label_trg: ${trg ? "OK" : "MISSING"}`);
} finally { await c.end(); }
