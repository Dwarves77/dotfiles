// Apply migration 094: compatibility shim restoring sources.tier as a synced
// alias to base_tier. Fixes production breakage introduced by Q2 (migration 090)
// renaming tier -> base_tier without first updating deployed consumers.

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
  const sql = readFileSync("supabase/migrations/094_tier_compat_shim.sql", "utf8");
  await client.query(sql);
  out.applied = true;

  out.tier_column_post = (await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources'
      AND column_name IN ('tier', 'base_tier', 'effective_tier')
    ORDER BY column_name
  `)).rows;

  out.trigger_post = (await client.query(`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table = 'sources'
      AND trigger_name = 'sources_sync_tier_columns'
  `)).rows;

  out.constraint_post = (await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass
      AND conname IN ('sources_tier_check', 'sources_tier_matches_base_tier')
    ORDER BY conname
  `)).rows;

  out.row_count_post = (await client.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE tier = base_tier)::int AS synced, COUNT(*) FILTER (WHERE tier IS NULL)::int AS tier_null FROM public.sources`
  )).rows[0];

  out.sample_rows = (await client.query(
    `SELECT id, name, tier, base_tier, effective_tier FROM public.sources ORDER BY name LIMIT 5`
  )).rows;

  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('094', 'tier_compat_shim', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;
} catch (err) {
  out.error = err.message;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
