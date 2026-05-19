// Q2: apply migration 090 (tier schema split: rename tier -> base_tier,
// add effective_tier, backfill effective_tier = base_tier on Day 1).
// Backfills the schema_migrations ledger.

import { readFileSync } from "node:fs";
import pg from "pg";

const DB_PASSWORD = readFileSync(".env.local", "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync("supabase/.temp/pooler-url", "utf8").trim();
const PROJECT_REF = readFileSync("supabase/.temp/project-ref", "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

try {
  const sql = readFileSync(
    "supabase/migrations/090_tier_schema_split.sql",
    "utf8"
  );

  // Pre-state.
  out.pre_state = {
    sources_count: (await client.query("SELECT COUNT(*)::int AS n FROM public.sources")).rows[0].n,
    tier_distribution: (await client.query(
      "SELECT tier, COUNT(*)::int AS n FROM public.sources GROUP BY tier ORDER BY tier NULLS LAST"
    )).rows,
    has_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='tier'"
    )).rowCount > 0,
    has_base_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='base_tier'"
    )).rowCount > 0,
    has_effective_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='effective_tier'"
    )).rowCount > 0,
  };

  await client.query(sql);
  out.applied = true;

  // Backfill ledger.
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('090', 'tier_schema_split', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;

  // Post-state: confirm rename + new column + backfill.
  out.post_state = {
    sources_count: (await client.query("SELECT COUNT(*)::int AS n FROM public.sources")).rows[0].n,
    has_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='tier'"
    )).rowCount > 0,
    has_base_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='base_tier'"
    )).rowCount > 0,
    has_effective_tier_column: (await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sources' AND column_name='effective_tier'"
    )).rowCount > 0,
    column_details: (await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sources'
        AND column_name IN ('tier','base_tier','effective_tier')
      ORDER BY column_name
    `)).rows,
    tier_check_constraints: (await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.sources'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%tier%'
      ORDER BY conname
    `)).rows,
    base_tier_distribution: (await client.query(
      "SELECT base_tier, COUNT(*)::int AS n FROM public.sources GROUP BY base_tier ORDER BY base_tier NULLS LAST"
    )).rows,
    effective_tier_distribution: (await client.query(
      "SELECT effective_tier, COUNT(*)::int AS n FROM public.sources GROUP BY effective_tier ORDER BY effective_tier NULLS LAST"
    )).rows,
    null_effective_tier_count: (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.sources WHERE effective_tier IS NULL"
    )).rows[0].n,
    mismatched_count: (await client.query(
      "SELECT COUNT(*)::int AS n FROM public.sources WHERE effective_tier IS DISTINCT FROM base_tier"
    )).rows[0].n,
    sample_rows: (await client.query(
      "SELECT id, name, base_tier, effective_tier FROM public.sources ORDER BY base_tier, name LIMIT 3"
    )).rows,
    views_exist: (await client.query(`
      SELECT relname FROM pg_class
      WHERE relname IN ('provisional_sources_review', 'source_health_summary')
        AND relnamespace = 'public'::regnamespace
      ORDER BY relname
    `)).rows,
    column_comments: (await client.query(`
      SELECT a.attname AS col, col_description(a.attrelid, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'public.sources'::regclass
        AND a.attname IN ('base_tier', 'effective_tier')
      ORDER BY a.attname
    `)).rows,
    ledger_present: (await client.query(
      "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '090'"
    )).rows,
  };
} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
