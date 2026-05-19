// Migration 083 post-flight: confirm trigger derive + one-shot backfill
// closed OBS-24 / Critical #1. Reports drop in iso-empty count, samples
// newly populated rows, and validates the helper on synthetic inputs.
//
// Output: scripts/tmp/mig083-postflight-output.json
//
// DB connection pattern per OBS-12.

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
  preflight_total_was: 451
};

// 1. Remaining rows with populated jurisdictions and empty iso.
const totalRes = await client.query(
  `SELECT COUNT(*)::int AS n
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0);`
);
out.remaining_iso_empty_with_populated_jurisdictions = totalRes.rows[0].n;
out.drop_count = 451 - out.remaining_iso_empty_with_populated_jurisdictions;

// 2. Sub-breakdown: rows that remain empty AND have no parseable tokens
//    (all canonical jurisdictions are non-ISO free-text like EU/GLOBAL).
const allRejectedRes = await client.query(
  `SELECT COUNT(*)::int AS n
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(jurisdictions) tok
        WHERE tok ~ '^[A-Z]{2}$'
           OR tok ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
      );`
);
out.remaining_no_parseable_tokens = allRejectedRes.rows[0].n;

// 3. Five samples of rows now populated. Show jurisdictions and
//    jurisdiction_iso side by side for visual confirmation that derive
//    produced the expected parent codes.
const sampleRes = await client.query(
  `SELECT id, title, jurisdictions, jurisdiction_iso
     FROM public.intelligence_items
    WHERE jurisdictions IS NOT NULL
      AND cardinality(jurisdictions) > 0
      AND jurisdiction_iso IS NOT NULL
      AND cardinality(jurisdiction_iso) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(jurisdictions) tok
        WHERE tok ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
      )
    ORDER BY id
    LIMIT 5;`
);
out.populated_samples = sampleRes.rows;

// 4. Synthetic helper tests. Validates the derive helper on canonical
//    inputs the spec calls out.
const tests = [
  { name: "US-PA single subdivision", input: ["US-PA"], expect: ["US"] },
  { name: "CA+CA-ON union dedupes to CA", input: ["CA", "CA-ON"], expect: ["CA"] },
  { name: "GB+GB-ENG union dedupes to GB", input: ["GB", "GB-ENG"], expect: ["GB"] },
  { name: "Multi-country US-PA+CA-ON", input: ["US-PA", "CA-ON"], expect: ["CA", "US"] },
  { name: "GLOBAL filtered (>2 chars, not alpha-2)", input: ["GLOBAL", "IMO"], expect: [] },
  { name: "Empty input", input: [], expect: [] },
  { name: "NULL input via ARRAY of NULLs", input: null, expect: [] },
  // Note: EU passes the ^[A-Z]{2}$ shape and is preserved per design.
  // The helper trusts the canonical array's existing CASE-table semantics;
  // tighter alpha-2 validation against the ISO 3166-1 reference list is
  // OBS-2 / OBS-8 territory (out of scope for migration 083).
  { name: "Mixed parseable + EU + GLOBAL", input: ["US", "EU", "GLOBAL", "CA-ON"], expect: ["CA", "EU", "US"] }
];

out.synthetic_tests = [];
for (const t of tests) {
  const r = await client.query(
    `SELECT public._derive_jurisdiction_iso_from_canonical($1::text[]) AS got;`,
    [t.input]
  );
  const got = r.rows[0].got || [];
  const pass =
    got.length === t.expect.length && got.every((v, i) => v === t.expect[i]);
  out.synthetic_tests.push({
    name: t.name,
    input: t.input,
    expected: t.expect,
    got,
    pass
  });
}

const allPass = out.synthetic_tests.every((t) => t.pass);
out.all_synthetic_tests_passed = allPass;

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/mig083-postflight-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
