// Q8 pre-flight refinement: verify UNION semantic of citation_count.
//
// Original dispatch brief: citation_count := sources_used @> ARRAY[source_id]
// Observed: 616/657 items have non-null source_id, only 159/657 have
//   non-empty sources_used. Counting via sources_used alone undercounts
//   legacy items severely.
//
// Refined v1 semantic: an item counts toward a source's citation_count if
// source_id = $1 OR sources_used @> ARRAY[$1]. Same for recency.
// This still revisits when Q1 brief->source edge table lands.

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

const sampleIds = [
  "0768a0d2-4f2e-4b4f-a84e-05084c107f79",
  "fa6d6470-6b45-452a-9bc6-6fdff4ec44ae",
  "87894622-d165-4ca0-84dd-13c433058616",
];

const out = { union_semantic: "source_id = $1 OR sources_used @> ARRAY[$1]", per_sample: [] };
for (const id of sampleIds) {
  const r = await client.query(`
    SELECT count(*)::int AS citation_count,
           max(added_date) AS recency
      FROM intelligence_items
     WHERE source_id = $1
        OR sources_used @> ARRAY[$1]::uuid[];
  `, [id]);
  out.per_sample.push({ source_id: id, ...r.rows[0] });
}

// RPC-shape dryrun with union semantic
const rpcRes = await client.query(`
  SELECT req.source_id,
         count(ii.*)::int AS citation_count,
         max(ii.added_date) AS recency
    FROM unnest($1::uuid[]) AS req(source_id)
    LEFT JOIN intelligence_items ii
      ON ii.source_id = req.source_id
      OR ii.sources_used @> ARRAY[req.source_id]::uuid[]
   GROUP BY req.source_id;
`, [sampleIds]);
out.rpc_shape_union_dryrun = rpcRes.rows;

await client.end();
console.log(JSON.stringify(out, null, 2));
