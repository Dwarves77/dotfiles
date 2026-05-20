// Apply migration 097: D1 Option B retroactive retune of Q4 bias tags.

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
  // Pre-state distribution
  out.pre_state = (await client.query(`
    SELECT assignment_source, COUNT(*)::int AS rows, COUNT(DISTINCT source_id)::int AS unique_sources
    FROM public.source_bias_tags
    GROUP BY assignment_source
    ORDER BY assignment_source
  `)).rows;

  const sql = readFileSync("supabase/migrations/097_q4_bias_retune_option_b.sql", "utf8");
  const res = await client.query(sql);
  out.applied = true;
  out.rows_promoted = res.rowCount ?? 0;

  // Post-state
  out.post_state = (await client.query(`
    SELECT assignment_source, COUNT(*)::int AS rows, COUNT(DISTINCT source_id)::int AS unique_sources
    FROM public.source_bias_tags
    GROUP BY assignment_source
    ORDER BY assignment_source
  `)).rows;

  // Verify methodology still in review (unchanged by this migration)
  out.methodology_review_post = (await client.query(`
    SELECT COUNT(*)::int AS methodology_review_rows, COUNT(DISTINCT source_id)::int AS unique_sources
    FROM public.source_bias_tags
    WHERE dimension = 'methodology' AND assignment_source = 'haiku_proposed_low_confidence'
  `)).rows[0];

  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('097', 'q4_bias_retune_option_b', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;
} catch (err) {
  out.error = err.message;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
