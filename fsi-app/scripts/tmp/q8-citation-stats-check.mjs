// Q8 pre-flight: verify citation_count + recency v1 semantics on live DB.
//
// Semantics under test (v1):
//   citation_count := count(intelligence_items where source_id in sources_used)
//   recency        := max(added_date) over the same set
//
// Note on recency column: the brief at dispatch time specified max(added_date)
// but intelligence_items has no added_date column. The closest semantic
// candidates on this table are added_date (date item entered platform),
// updated_at (last touch), and created_at (insertion timestamp).
// added_date best matches "recency" as a content-publication signal because
// it is the operator-curated value on each item; created_at and updated_at
// drift with platform plumbing rather than content cadence. Selected:
// added_date. This is a v1 deferral candidate; revisits when Q1 brief->source
// edge table lands and a brief-publication timestamp becomes first-class.
//
// Pulls 3 sample source_ids from sources table and runs the two aggregates
// per source. Reports rowcount + recency per source. v1 semantics are
// confirmed reasonable if a mix of well-covered + zero-coverage sources
// appears in the sample (any sample shape is informative; the goal is to
// surface the v1 query shape, not to validate substantive content).
//
// DB connection pattern per OBS-12 + scripts/tmp/mig083-apply.mjs.

import { readFileSync, writeFileSync } from "node:fs";
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

const out = {
  generated_at: new Date().toISOString(),
  v1_semantics: {
    citation_count: "count(intelligence_items where source_id in sources_used) (array containment)",
    recency: "max(added_date) over the same set"
  },
  recency_column_choice: {
    selected: "added_date",
    reason: "intelligence_items has no published_at; added_date is operator-curated and tracks content cadence; created_at/updated_at drift with platform plumbing",
    candidates_seen: ["added_date (date)", "created_at (timestamptz)", "updated_at (timestamptz)", "last_regenerated_at (timestamptz)"]
  },
};

// Schema introspection: confirm intelligence_items has sources_used UUID[] column
const colRes = await client.query(`
  SELECT column_name, data_type, udt_name
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'intelligence_items'
     AND column_name IN ('sources_used', 'source_id', 'added_date')
   ORDER BY column_name;
`);
out.intelligence_items_columns = colRes.rows;

// Pick 3 sample source_ids that are referenced in intelligence_items.sources_used
// to give the aggregates something to find.
const sampleRes = await client.query(`
  SELECT DISTINCT s.id, s.name, s.tier
    FROM sources s
    JOIN intelligence_items ii
      ON ii.sources_used @> ARRAY[s.id]::uuid[]
   WHERE s.id IS NOT NULL
   ORDER BY s.name
   LIMIT 3;
`);
out.sample_sources = sampleRes.rows;

// Per-sample: citation_count + recency under v1 semantics
const perSample = [];
for (const s of sampleRes.rows) {
  const statsRes = await client.query(`
    SELECT count(*)::int AS citation_count,
           max(added_date) AS recency
      FROM intelligence_items
     WHERE sources_used @> ARRAY[$1]::uuid[];
  `, [s.id]);
  perSample.push({
    source_id: s.id,
    source_name: s.name,
    source_tier: s.tier,
    citation_count: statsRes.rows[0].citation_count,
    recency: statsRes.rows[0].recency,
  });
}
out.per_sample_stats = perSample;

// Also verify the aggregate query shape that the RPC will use (single round trip)
const rpcShapeRes = await client.query(`
  SELECT s.id AS source_id,
         count(ii.*)::int AS citation_count,
         max(ii.added_date) AS recency
    FROM unnest($1::uuid[]) AS req(source_id)
    JOIN sources s ON s.id = req.source_id
    LEFT JOIN intelligence_items ii ON ii.sources_used @> ARRAY[s.id]::uuid[]
   GROUP BY s.id;
`, [sampleRes.rows.map(r => r.id)]);
out.rpc_shape_dryrun = rpcShapeRes.rows;

// Also confirm legacy source_id column on intelligence_items: documenting
// the parallel-shape question for the deferral note.
const legacyShapeRes = await client.query(`
  SELECT count(*)::int AS items_with_source_id,
         count(*) FILTER (WHERE source_id IS NOT NULL)::int AS items_with_nonnull_source_id
    FROM intelligence_items;
`);
out.legacy_source_id_coverage = legacyShapeRes.rows[0];

const arrayShapeRes = await client.query(`
  SELECT count(*)::int AS items_with_sources_used,
         count(*) FILTER (WHERE coalesce(array_length(sources_used, 1), 0) > 0)::int AS items_with_nonempty_sources_used
    FROM intelligence_items;
`);
out.sources_used_coverage = arrayShapeRes.rows[0];

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/q8-citation-stats-check-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
