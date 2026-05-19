// Phase 5 implementation pre-flight (2026-05-18, post-Phase-4b apply).
//
// Verifies counts haven't drifted from the design doc's numbers, captures
// item_supersessions.severity existing vocabulary for Q5, confirms ingest
// is paused, confirms queue tables present.

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

// 1. Confirm 457 ISO-empty rows
out.iso_empty_with_jurisdictions = (await client.query(`
  SELECT COUNT(*) AS n
  FROM public.intelligence_items
  WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
    AND jurisdictions IS NOT NULL AND cardinality(jurisdictions) > 0;
`)).rows[0];

// 2. Confirm 5 NYC items (any NYC token in jurisdictions or jurisdiction_iso)
out.nyc_items = (await client.query(`
  SELECT j AS value, COUNT(DISTINCT id) AS n_items
  FROM public.intelligence_items, unnest(jurisdictions) AS j
  WHERE lower(j) IN ('new york city','new_york_city','nyc','brooklyn','manhattan','queens','bronx','staten island','staten_island','the bronx')
  GROUP BY j
  UNION ALL
  SELECT j AS value, COUNT(DISTINCT id) AS n_items
  FROM public.intelligence_items, unnest(jurisdiction_iso) AS j
  WHERE lower(j) IN ('new york city','new_york_city','nyc','brooklyn','manhattan','queens','bronx','staten island','staten_island','the bronx')
  GROUP BY j;
`)).rows;

// 3. Confirm all 6 loser UUIDs still present
out.loser_uuids_present = (await client.query(`
  SELECT id, title FROM public.intelligence_items
  WHERE id::text LIKE 'b8b6fde3%' OR id::text LIKE 'd56ca4e1%'
     OR id::text LIKE '33ca228c%' OR id::text LIKE 'bec305e1%'
     OR id::text LIKE '82f09535%' OR id::text LIKE 'daaa7e3a%'
  ORDER BY id::text;
`)).rows;

// 4. Confirm winner UUIDs present + sample their current state
out.winner_uuids_present = (await client.query(`
  SELECT id, title, jurisdictions, jurisdiction_iso, instrument_type, instrument_identifier
  FROM public.intelligence_items
  WHERE id::text LIKE 'f67aabad%' OR id::text LIKE '4d5670cb%'
     OR id::text LIKE '3ae89ce6%' OR id::text LIKE '03b5f234%'
     OR id::text LIKE 'fb86ee11%'
  ORDER BY id::text;
`)).rows;

// 5. item_supersessions.severity existing vocabulary
out.item_supersessions_severity_vocab = (await client.query(`
  SELECT severity, COUNT(*) AS n
  FROM public.item_supersessions
  GROUP BY severity
  ORDER BY n DESC, severity;
`)).rows;

// 6. item_supersessions full schema (confirm columns)
out.item_supersessions_columns = (await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'item_supersessions'
  ORDER BY ordinal_position;
`)).rows;

// 7. ingestion_control_log: latest entry to confirm pause state
out.ingestion_control_latest = (await client.query(`
  SELECT *
  FROM public.ingestion_control_log
  ORDER BY id DESC
  LIMIT 1;
`)).rows;

// 8. Confirm queue tables exist
out.queue_tables = (await client.query(`
  SELECT table_name, (SELECT COUNT(*) FROM public.pending_jurisdiction_review) AS pjr_total,
         (SELECT COUNT(*) FROM public.ingest_rejections) AS ir_total
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('ingest_rejections', 'pending_jurisdiction_review')
  ORDER BY table_name
  LIMIT 1;
`)).rows[0];

// 9. Confirm hidden_reason column exists on intelligence_items (migration 062)
out.hidden_reason_col = (await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'intelligence_items'
    AND column_name = 'hidden_reason';
`)).rows[0];

// 10. item_cross_references on loser UUIDs (reconfirm zero hits)
out.item_cross_references_loser_hits = (await client.query(`
  SELECT COUNT(*) AS n
  FROM public.item_cross_references
  WHERE source_item_id::text LIKE 'b8b6fde3%' OR source_item_id::text LIKE 'd56ca4e1%'
     OR source_item_id::text LIKE '33ca228c%' OR source_item_id::text LIKE 'bec305e1%'
     OR source_item_id::text LIKE '82f09535%' OR source_item_id::text LIKE 'daaa7e3a%'
     OR target_item_id::text LIKE 'b8b6fde3%' OR target_item_id::text LIKE 'd56ca4e1%'
     OR target_item_id::text LIKE '33ca228c%' OR target_item_id::text LIKE 'bec305e1%'
     OR target_item_id::text LIKE '82f09535%' OR target_item_id::text LIKE 'daaa7e3a%';
`)).rows[0];

// 11. Trigger present + enabled (so workload A's DISABLE has something to disable)
out.trigger_state = (await client.query(`
  SELECT tgname, tgenabled
  FROM pg_trigger
  WHERE tgrelid = 'public.intelligence_items'::regclass
    AND tgname = 'trg_intelligence_items_normalize_jurisdictions';
`)).rows[0];

// 12. Snapshot table presence check (should be absent)
out.snapshot_tables_present = (await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name LIKE '%_pre_phase5';
`)).rows;

await client.end();
console.log(JSON.stringify(out, null, 2));
