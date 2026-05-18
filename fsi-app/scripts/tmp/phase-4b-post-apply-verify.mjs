// Phase 4b post-apply verification: confirm prod DB state matches the
// dry-run expectations.

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

out.queue_totals = (await client.query(`
  SELECT
    (SELECT COUNT(*) FROM public.pending_jurisdiction_review) AS pjr_count,
    (SELECT COUNT(*) FROM public.pending_jurisdiction_review WHERE resolved_at IS NULL) AS pjr_unresolved,
    (SELECT COUNT(*) FROM public.ingest_rejections) AS ir_count;
`)).rows[0];

out.pjr_by_reason_and_column = (await client.query(`
  SELECT source_column, flagged_reason, COUNT(*) AS n
  FROM public.pending_jurisdiction_review
  GROUP BY source_column, flagged_reason
  ORDER BY source_column, flagged_reason;
`)).rows;

out.rls_status = (await client.query(`
  SELECT relname AS table_name, relrowsecurity AS rls_enabled
  FROM pg_class
  WHERE relname IN ('ingest_rejections', 'pending_jurisdiction_review')
    AND relnamespace = 'public'::regnamespace;
`)).rows;

out.trigger_fn = (await client.query(`
  SELECT prosecdef, proconfig
  FROM pg_proc
  WHERE proname = '_intelligence_items_normalize_jurisdictions'
    AND pronamespace = 'public'::regnamespace;
`)).rows[0];

out.deferrable_fk = (await client.query(`
  SELECT conname, condeferrable, condeferred
  FROM pg_constraint
  WHERE conname = 'pjr_intelligence_item_fkey';
`)).rows[0];

await client.end();
console.log(JSON.stringify(out, null, 2));
