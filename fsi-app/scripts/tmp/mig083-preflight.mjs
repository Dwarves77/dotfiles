// Migration 083 pre-flight: confirm row counts before applying the
// trigger derive change. Closes OBS-24 / Critical #1.
//
// Verifies:
//   1. Count of rows where jurisdictions populated AND jurisdiction_iso
//      empty (Stage 1 / critical-investigations doc reported ~451).
//   2. Sub-count where the canonical jurisdictions carry purely
//      parseable tokens (alpha-2 or XX-YYY subdivision). Stage 1
//      reported 362 of the 451.
//   3. 5 sample rows for visual inspection.
//
// Output: scripts/tmp/mig083-preflight-output.json
//
// DB connection pattern per OBS-12 (phase-5-toggle-pause.mjs).

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
  stage_1_expected_total: 451,
  stage_1_expected_parseable: 362
};

// 1. Total rows with populated jurisdictions and empty jurisdiction_iso.
const totalRes = await client.query(
  `SELECT COUNT(*)::int AS n
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0);`
);
out.total_rows_jurisdictions_populated_iso_empty = totalRes.rows[0].n;

// 2. Sub-count where derived ISO array is non-empty (i.e. at least one
//    canonical token yields a parent country code via the regex shapes
//    this migration's helper recognises). This is the population the
//    backfill UPDATE will actually populate.
const parseableRes = await client.query(
  `SELECT COUNT(*)::int AS n
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
      AND EXISTS (
        SELECT 1 FROM unnest(jurisdictions) tok
        WHERE tok ~ '^[A-Z]{2}$'
           OR tok ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
      );`
);
out.rows_with_parseable_canonical_tokens = parseableRes.rows[0].n;

// 3. Five sample rows: id, title, jurisdictions, expected derived ISO.
const sampleRes = await client.query(
  `SELECT id, title, jurisdictions
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
      AND EXISTS (
        SELECT 1 FROM unnest(jurisdictions) tok
        WHERE tok ~ '^[A-Z]{2}$'
           OR tok ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
      )
    ORDER BY id
    LIMIT 5;`
);
out.samples = sampleRes.rows.map((r) => {
  const derived = new Set();
  for (const tok of r.jurisdictions || []) {
    if (/^[A-Z]{2}$/.test(tok)) derived.add(tok);
    else if (/^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(tok)) derived.add(tok.split("-")[0]);
  }
  return {
    id: r.id,
    title: r.title,
    jurisdictions: r.jurisdictions,
    expected_derived_iso: [...derived].sort()
  };
});

// Drift check: flag if count diverges materially from Stage 1's 451.
const drift = Math.abs(out.total_rows_jurisdictions_populated_iso_empty - 451);
out.drift_from_stage_1 = drift;
out.drift_material = drift > Math.round(451 * 0.5);

await client.end();

const outPath = resolve(process.cwd(), "scripts/tmp/mig083-preflight-output.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
