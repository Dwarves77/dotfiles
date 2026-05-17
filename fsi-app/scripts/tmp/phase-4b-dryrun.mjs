// Phase 4b dry-run: execute migration 082 inside a transaction, run
// verification queries, then ROLLBACK so DB state is unchanged.
// Catches any SQL syntax / constraint / RLS errors before the real apply.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);
const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

// Load migration 082 body
const migrationPath = resolve(process.cwd(), "supabase/migrations/082_operator_queues_and_routing.sql");
let migrationSql = readFileSync(migrationPath, "utf8");

// Strip the outer BEGIN/COMMIT since we wrap the dry-run in our own tx
migrationSql = migrationSql.replace(/^\s*BEGIN\s*;/m, "-- BEGIN; (stripped for dry-run)");
migrationSql = migrationSql.replace(/^\s*COMMIT\s*;/m, "-- COMMIT; (stripped for dry-run)");

try {
  await client.query("BEGIN");

  // Apply the migration body inside our transaction
  await client.query(migrationSql);
  out.migration_applied_no_error = true;

  // Verify table shape
  const tablesQuery = `
    SELECT table_name, COUNT(*) AS column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('ingest_rejections', 'pending_jurisdiction_review')
    GROUP BY table_name
    ORDER BY table_name;
  `;
  out.tables_created = (await client.query(tablesQuery)).rows;

  // Verify RLS enabled
  const rlsQuery = `
    SELECT relname AS table_name, relrowsecurity AS rls_enabled
    FROM pg_class
    WHERE relname IN ('ingest_rejections', 'pending_jurisdiction_review')
      AND relnamespace = 'public'::regnamespace;
  `;
  out.rls_status = (await client.query(rlsQuery)).rows;

  // Verify policies exist
  const policiesQuery = `
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('ingest_rejections', 'pending_jurisdiction_review')
    ORDER BY tablename, policyname;
  `;
  out.rls_policies = (await client.query(policiesQuery)).rows;

  // Verify partial unique index exists with the right predicate
  const indexQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'pending_jurisdiction_review';
  `;
  out.pjr_indexes = (await client.query(indexQuery)).rows;

  // Verify FK is DEFERRABLE
  const fkQuery = `
    SELECT conname, condeferrable, condeferred
    FROM pg_constraint
    WHERE conrelid = 'public.pending_jurisdiction_review'::regclass
      AND contype = 'f';
  `;
  out.pjr_fk_deferrable = (await client.query(fkQuery)).rows;

  // Verify trigger function is SECURITY DEFINER
  const fnQuery = `
    SELECT proname, prosecdef, proconfig
    FROM pg_proc
    WHERE proname = '_intelligence_items_normalize_jurisdictions'
      AND pronamespace = 'public'::regnamespace;
  `;
  out.trigger_fn_security = (await client.query(fnQuery)).rows;

  // Verify populate count
  const populateQuery = `
    SELECT
      source_column,
      flagged_reason,
      COUNT(*) AS n
    FROM public.pending_jurisdiction_review
    GROUP BY source_column, flagged_reason
    ORDER BY source_column, flagged_reason;
  `;
  out.populate_result = (await client.query(populateQuery)).rows;

  // Total count check
  const totalQuery = `
    SELECT
      (SELECT COUNT(*) FROM public.pending_jurisdiction_review) AS pjr_count,
      (SELECT COUNT(*) FROM public.ingest_rejections) AS ir_count;
  `;
  out.totals = (await client.query(totalQuery)).rows[0];

  // Test the trigger by simulating an INSERT into intelligence_items
  // (we'll do this on a temporary row that we immediately delete; the
  // overall transaction is being rolled back anyway).
  // Discover NOT NULL columns on intelligence_items so the test INSERT
  // populates everything required.
  const colsQuery = `
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intelligence_items'
      AND is_nullable = 'NO'
    ORDER BY ordinal_position;
  `;
  out.intelligence_items_not_null_cols = (await client.query(colsQuery)).rows;

  // Use SELECT to read a real row's structural defaults; copy-style insert.
  // Build a minimal INSERT covering all NOT NULL columns without defaults.
  // Only title and domain lack defaults; everything else uses table defaults.
  const triggerTestQuery = `
    INSERT INTO public.intelligence_items (title, domain, jurisdictions)
    VALUES (
      'Phase 4b dry-run test row',
      1,
      ARRAY['US', 'BROOKLYN', 'CARSON_RIVER_WATERSHED', 'ASIA']
    )
    RETURNING id, jurisdictions;
  `;
  try {
    const triggerRes = await client.query(triggerTestQuery);
    out.trigger_test_result = triggerRes.rows[0];

    // Inspect what landed in the queue tables
    const queueAfterQuery = `
      SELECT
        (SELECT COUNT(*) FROM public.pending_jurisdiction_review
           WHERE intelligence_item_id = $1) AS pjr_new,
        (SELECT COUNT(*) FROM public.ingest_rejections
           WHERE ingest_attempted_at > NOW() - INTERVAL '5 seconds') AS ir_new;
    `;
    out.queue_after_trigger = (await client.query(queueAfterQuery, [triggerRes.rows[0].id])).rows[0];

    // Check exact rows
    const newRowsQuery = `
      SELECT current_value, flagged_reason, source_column
      FROM public.pending_jurisdiction_review
      WHERE intelligence_item_id = $1;
    `;
    out.pjr_new_rows = (await client.query(newRowsQuery, [triggerRes.rows[0].id])).rows;

    const newRejQuery = `
      SELECT raw_value, rejection_reason
      FROM public.ingest_rejections
      WHERE ingest_attempted_at > NOW() - INTERVAL '5 seconds';
    `;
    out.ir_new_rows = (await client.query(newRejQuery)).rows;
  } catch (e) {
    out.trigger_test_error = e.message;
  }
} catch (e) {
  out.migration_error = e.message;
  out.migration_stack = e.stack;
} finally {
  await client.query("ROLLBACK");
  out.rolled_back = true;
  await client.end();
}

console.log(JSON.stringify(out, null, 2));
