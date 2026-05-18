// Phase 5 mid-execute state check after backfill exited.
// Verifies trigger state, snapshot table presence, and how many rows were
// updated in workload A before the connection drop.

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

out.trigger_state = (await client.query(`
  SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid = 'public.intelligence_items'::regclass
    AND tgname = 'trg_intelligence_items_normalize_jurisdictions';
`)).rows[0];

out.snapshot_tables = (await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE '%_pre_phase5';
`)).rows;

out.iso_empty_remaining = (await client.query(`
  SELECT COUNT(*) AS n FROM public.intelligence_items
  WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
    AND jurisdictions IS NOT NULL AND cardinality(jurisdictions) > 0;
`)).rows[0];

out.iso_populated_diff_from_snapshot = (await client.query(`
  SELECT COUNT(*) AS n
  FROM public.intelligence_items ii
  JOIN public.intelligence_items_pre_phase5 snap ON snap.id = ii.id
  WHERE cardinality(COALESCE(ii.jurisdiction_iso, ARRAY[]::text[])) <> cardinality(COALESCE(snap.jurisdiction_iso, ARRAY[]::text[]))
     OR cardinality(COALESCE(ii.jurisdictions, ARRAY[]::text[])) <> cardinality(COALESCE(snap.jurisdictions, ARRAY[]::text[]));
`)).rows[0];

out.queue_growth = (await client.query(`
  SELECT
    (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review) AS pjr_now,
    (SELECT COUNT(*)::int FROM public.pending_jurisdiction_review_pre_phase5) AS pjr_snap,
    (SELECT COUNT(*)::int FROM public.ingest_rejections) AS ir_now,
    (SELECT COUNT(*)::int FROM public.ingest_rejections_pre_phase5) AS ir_snap;
`)).rows[0];

out.global_processing_paused = (await client.query(`
  SELECT global_processing_paused FROM public.system_state WHERE id = true;
`)).rows[0];

await client.end();
console.log(JSON.stringify(out, null, 2));
