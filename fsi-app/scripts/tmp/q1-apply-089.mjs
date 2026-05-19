// Q1: apply migration 089 (intelligence_item_citations edge table + backfill).
//
// Pattern follows OBS-12 canonical pooler-mode session-mode apply
// (template at scripts/tmp/d16-apply-085.mjs). Reads SUPABASE_DB_PASSWORD
// from .env.local, pooler URL and project ref from supabase/.temp/.
//
// Idempotent: the migration uses CREATE TABLE IF NOT EXISTS / CREATE INDEX
// IF NOT EXISTS / ON CONFLICT DO NOTHING throughout. Safe to re-run.
//
// Expected output:
// - applied: true
// - table_exists: 'intelligence_item_citations' present in pg_class
// - indexes: 4 (PK + 3 named)
// - constraints: PK + UNIQUE + FK x2 + CHECK
// - backfill_count: 752 rows (159 items x avg 4.7 sources, per probe 2026-05-19)
// - sample: 3 rows from the table
// - ledger: 089 entry inserted

import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION_SQL_PATH = process.env.MIGRATION_SQL_PATH
  || "supabase/migrations/089_intelligence_item_citations.sql";

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
  const sql = readFileSync(MIGRATION_SQL_PATH, "utf8");
  await client.query(sql);
  out.applied = true;

  out.table_exists = (await client.query(`
    SELECT to_regclass('public.intelligence_item_citations')::text AS t
  `)).rows;

  out.columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'intelligence_item_citations'
    ORDER BY ordinal_position
  `)).rows;

  out.indexes = (await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'intelligence_item_citations'
    ORDER BY indexname
  `)).rows;

  out.constraints = (await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.intelligence_item_citations'::regclass
    ORDER BY contype, conname
  `)).rows;

  out.backfill_count = (await client.query(`
    SELECT count(*)::int AS c
    FROM public.intelligence_item_citations
    WHERE origin = 'sources_used_backfill'
  `)).rows[0];

  out.total_count = (await client.query(`
    SELECT count(*)::int AS c FROM public.intelligence_item_citations
  `)).rows[0];

  out.origin_distribution = (await client.query(`
    SELECT origin, count(*)::int AS c
    FROM public.intelligence_item_citations
    GROUP BY origin
    ORDER BY origin
  `)).rows;

  out.expected_count = (await client.query(`
    SELECT count(*)::int AS c FROM (
      SELECT DISTINCT ii.id, unnest(ii.sources_used) AS sid
      FROM public.intelligence_items ii
      WHERE sources_used IS NOT NULL AND array_length(sources_used, 1) > 0
    ) p WHERE EXISTS (SELECT 1 FROM public.sources s WHERE s.id = p.sid)
  `)).rows[0];

  out.sample_rows = (await client.query(`
    SELECT iic.id,
           iic.intelligence_item_id,
           iic.source_id,
           iic.detected_at,
           iic.origin,
           ii.title AS item_title,
           s.name AS source_name
    FROM public.intelligence_item_citations iic
    JOIN public.intelligence_items ii ON ii.id = iic.intelligence_item_id
    JOIN public.sources s ON s.id = iic.source_id
    ORDER BY iic.detected_at DESC
    LIMIT 3
  `)).rows;

  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('089', 'intelligence_item_citations', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;

  out.ledger_recent = (await client.query(`
    SELECT version, name FROM supabase_migrations.schema_migrations
    WHERE version >= '085'
    ORDER BY version DESC
  `)).rows;
} catch (err) {
  out.error = err.message;
  out.error_stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
