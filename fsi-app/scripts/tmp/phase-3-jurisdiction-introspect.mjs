// Sprint 1 Phase 3 introspection.
// Read-only: distinct values in intelligence_items.jurisdictions and
// intelligence_items.jurisdiction_iso plus per-value occurrence counts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();

if (!DB_PASSWORD || !POOLER_URL || !PROJECT_REF) {
  console.error("Missing DB password (.env.local) or pooler-url/project-ref (supabase/.temp/)");
  process.exit(1);
}

const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();

const out = {};

// ── Q1: distinct values in intelligence_items.jurisdictions (free-text)
const jurArrQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdictions) AS j
  GROUP BY j
  ORDER BY COUNT(*) DESC, j ASC;
`;
const jurArrRes = await client.query(jurArrQuery);
out.jurisdictions_distinct = jurArrRes.rows;
out.jurisdictions_total_distinct = jurArrRes.rows.length;

// ── Q2: distinct values in intelligence_items.jurisdiction_iso (ISO codes)
const jurIsoQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdiction_iso) AS j
  GROUP BY j
  ORDER BY COUNT(*) DESC, j ASC;
`;
const jurIsoRes = await client.query(jurIsoQuery);
out.jurisdiction_iso_distinct = jurIsoRes.rows;
out.jurisdiction_iso_total_distinct = jurIsoRes.rows.length;

// ── Q3: distinct values in sources.jurisdictions (also has the column)
try {
  const srcJurQuery = `
    SELECT j AS value, COUNT(*) AS n
    FROM sources, unnest(jurisdictions) AS j
    GROUP BY j
    ORDER BY COUNT(*) DESC, j ASC;
  `;
  const srcJurRes = await client.query(srcJurQuery);
  out.sources_jurisdictions_distinct = srcJurRes.rows;
  out.sources_jurisdictions_total_distinct = srcJurRes.rows.length;
} catch (e) {
  out.sources_jurisdictions_distinct = { error: e.message };
}

// ── Q4: rows where jurisdictions vs jurisdiction_iso disagree (after migration 072 trigger should have normalized both)
const disagreementQuery = `
  SELECT
    COUNT(*) AS rows_with_jur,
    COUNT(*) FILTER (WHERE jurisdiction_iso IS NULL OR array_length(jurisdiction_iso, 1) IS NULL) AS rows_iso_empty,
    COUNT(*) FILTER (WHERE jurisdictions IS NULL OR array_length(jurisdictions, 1) IS NULL) AS rows_jur_empty
  FROM intelligence_items
  WHERE jurisdictions IS NOT NULL OR jurisdiction_iso IS NOT NULL;
`;
const disagreementRes = await client.query(disagreementQuery);
out.row_population_stats = disagreementRes.rows[0];

await client.end();

console.log(JSON.stringify(out, null, 2));
