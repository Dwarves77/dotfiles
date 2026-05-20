// D1 investigation: distribution of review-queue rows for Q4 bias tags.
// Surfaces whether the 249-unique-source overage is concentrated in one
// dimension, one confidence band, or one source category/tier, vs uniform
// across the population.

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
  // Distribution by dimension (funding / methodology / stakeholder)
  out.by_dimension = (await client.query(`
    SELECT dimension,
           COUNT(*)::int AS review_rows,
           COUNT(DISTINCT source_id)::int AS unique_sources
    FROM public.source_bias_tags
    WHERE assignment_source = 'haiku_proposed_low_confidence'
    GROUP BY dimension
    ORDER BY dimension
  `)).rows;

  // Distribution by confidence in 0.05 buckets across 0.65-0.79
  out.by_confidence_bucket = (await client.query(`
    SELECT
      CASE
        WHEN confidence >= 0.75 THEN '0.75-0.79'
        WHEN confidence >= 0.70 THEN '0.70-0.74'
        WHEN confidence >= 0.65 THEN '0.65-0.69'
      END AS bucket,
      COUNT(*)::int AS rows,
      COUNT(DISTINCT source_id)::int AS unique_sources
    FROM public.source_bias_tags
    WHERE assignment_source = 'haiku_proposed_low_confidence'
    GROUP BY bucket
    ORDER BY bucket
  `)).rows;

  // Distribution by source category (sources.category from migration 084)
  out.by_source_category = (await client.query(`
    SELECT s.category,
           COUNT(*)::int AS review_rows,
           COUNT(DISTINCT b.source_id)::int AS unique_sources
    FROM public.source_bias_tags b
    JOIN public.sources s ON s.id = b.source_id
    WHERE b.assignment_source = 'haiku_proposed_low_confidence'
    GROUP BY s.category
    ORDER BY unique_sources DESC
  `)).rows;

  // Distribution by source tier
  out.by_source_tier = (await client.query(`
    SELECT s.base_tier AS tier,
           COUNT(*)::int AS review_rows,
           COUNT(DISTINCT b.source_id)::int AS unique_sources
    FROM public.source_bias_tags b
    JOIN public.sources s ON s.id = b.source_id
    WHERE b.assignment_source = 'haiku_proposed_low_confidence'
    GROUP BY s.base_tier
    ORDER BY s.base_tier
  `)).rows;

  // Sources with ONLY review tags (no auto tags at all) — these need full operator review
  out.review_only_sources = (await client.query(`
    SELECT COUNT(DISTINCT source_id)::int AS count
    FROM public.source_bias_tags b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.source_bias_tags b2
      WHERE b2.source_id = b.source_id
        AND b2.assignment_source = 'haiku_auto_high_confidence'
    )
    AND b.assignment_source = 'haiku_proposed_low_confidence'
  `)).rows[0].count;

  // Most-frequent review tags (which specific tags are over-flagged)
  out.top_review_tags = (await client.query(`
    SELECT dimension || '/' || tag AS tag,
           COUNT(*)::int AS occurrences,
           ROUND(AVG(confidence)::numeric, 3) AS avg_confidence
    FROM public.source_bias_tags
    WHERE assignment_source = 'haiku_proposed_low_confidence'
    GROUP BY dimension, tag
    ORDER BY occurrences DESC
    LIMIT 15
  `)).rows;
} catch (err) {
  out.error = err.message;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
