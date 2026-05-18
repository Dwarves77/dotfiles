// Phase 4b pre-flight: introspect intelligence_items schema for source
// context columns + verify post-080 state of normalizer function +
// count rows that will become pending_jurisdiction_review entries.

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

// 1. intelligence_items source-context columns
const colQuery = `
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'intelligence_items'
    AND column_name IN ('source_id','source_url','source_canonical_id','origin_source_id','primary_source_id','source','url')
  ORDER BY column_name;
`;
out.intelligence_items_source_cols = (await client.query(colQuery)).rows;

// 2. Sample of any column ending in _id or _url to see what's there
const sampleColQuery = `
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'intelligence_items'
    AND (column_name LIKE '%source%' OR column_name LIKE '%url%' OR column_name LIKE '%origin%')
  ORDER BY ordinal_position;
`;
out.intelligence_items_source_related = (await client.query(sampleColQuery)).rows;

// 3. Verify post-080 normalizer signature
const fnSigQuery = `
  SELECT
    p.proname,
    pg_catalog.pg_get_function_arguments(p.oid) AS args,
    pg_catalog.pg_get_function_result(p.oid) AS result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_normalize_jurisdictions', '_classify_jurisdiction_token', '_intelligence_items_normalize_jurisdictions');
`;
out.function_signatures_post_080 = (await client.query(fnSigQuery)).rows;

// 4. Per-token row counts that will become pending_jurisdiction_review entries
// continents, region_buckets, undefined_groups (per Phase 3 operator decisions)
const pendingPopulateQuery = `
  WITH offending_tokens AS (
    SELECT
      ii.id AS intelligence_item_id,
      j AS current_value,
      public._classify_jurisdiction_token(j) AS classification
    FROM public.intelligence_items ii, unnest(ii.jurisdictions) AS j
    WHERE public._classify_jurisdiction_token(j) IN ('continent','region_bucket','undefined_group')
  )
  SELECT classification, COUNT(*) AS n
  FROM offending_tokens
  GROUP BY classification
  ORDER BY n DESC;
`;
out.pending_review_populate_counts = (await client.query(pendingPopulateQuery)).rows;

// 5. Total distinct (intelligence_item_id, current_value) pairs that will
//    be written to pending_jurisdiction_review
const distinctPairsQuery = `
  WITH offending_tokens AS (
    SELECT
      ii.id AS intelligence_item_id,
      j AS current_value
    FROM public.intelligence_items ii, unnest(ii.jurisdictions) AS j
    WHERE public._classify_jurisdiction_token(j) IN ('continent','region_bucket','undefined_group')
  )
  SELECT COUNT(*) AS total_pairs,
         COUNT(DISTINCT intelligence_item_id) AS distinct_items
  FROM offending_tokens;
`;
out.distinct_pairs_to_populate = (await client.query(distinctPairsQuery)).rows[0];

// 6. Sample the first 10 rows that will be written, for spot-check
const sampleQuery = `
  WITH offending_tokens AS (
    SELECT
      ii.id AS intelligence_item_id,
      ii.title,
      j AS current_value,
      public._classify_jurisdiction_token(j) AS classification
    FROM public.intelligence_items ii, unnest(ii.jurisdictions) AS j
    WHERE public._classify_jurisdiction_token(j) IN ('continent','region_bucket','undefined_group')
  )
  SELECT * FROM offending_tokens LIMIT 10;
`;
out.sample_first_10_rows = (await client.query(sampleQuery)).rows;

// 7. Existing operator-queue tables (should be absent before 082)
const queueTableQuery = `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('ingest_rejections', 'pending_jurisdiction_review');
`;
out.existing_queue_tables = (await client.query(queueTableQuery)).rows;

await client.end();
console.log(JSON.stringify(out, null, 2));
