// Phase 4a SQL-review amendment pre-flight:
//   1. NYC borough presence in intelligence_items.jurisdictions
//      (HIGH #1 says: verify Queens/Bronx/Staten Island appear, or
//      defensive adds are over-eager but harmless)
//   2. 'u.s.a' / 'u.s.a.' variant presence in jurisdictions (LOW #1)
//   3. Composite tokens that include city,state form for the boroughs
//      (e.g. 'Brooklyn, NY')
//   4. Distinct row counts that will be affected by Brooklyn/Manhattan
//      reclass from US-NY to US-NYC

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

// 1. NYC borough presence in jurisdictions / jurisdiction_iso
const boroughQuery = `
  SELECT j AS value, COUNT(*) AS n, 'jurisdictions' AS column_name
  FROM intelligence_items, unnest(jurisdictions) AS j
  WHERE lower(j) IN ('brooklyn','manhattan','queens','bronx','the bronx','staten island','staten_island')
     OR lower(j) LIKE '%brooklyn%'
     OR lower(j) LIKE '%manhattan%'
     OR lower(j) LIKE '%queens%'
     OR lower(j) LIKE '%bronx%'
     OR lower(j) LIKE '%staten%'
  GROUP BY j
  UNION ALL
  SELECT j AS value, COUNT(*) AS n, 'jurisdiction_iso' AS column_name
  FROM intelligence_items, unnest(jurisdiction_iso) AS j
  WHERE lower(j) IN ('brooklyn','manhattan','queens','bronx','the bronx','staten island','staten_island')
     OR lower(j) LIKE '%brooklyn%'
     OR lower(j) LIKE '%manhattan%'
     OR lower(j) LIKE '%queens%'
     OR lower(j) LIKE '%bronx%'
     OR lower(j) LIKE '%staten%'
  GROUP BY j
  ORDER BY n DESC;
`;
out.borough_presence = (await client.query(boroughQuery)).rows;

// 2. 'u.s.a' / 'u.s.a.' variants
const usaVariantsQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdictions) AS j
  WHERE lower(j) IN ('u.s.a','u.s.a.','u.s','u.s.')
     OR lower(j) LIKE '%u.s.a%'
  GROUP BY j;
`;
out.usa_variant_presence = (await client.query(usaVariantsQuery)).rows;

// 3. Distinct rows that currently have NEW YORK CITY / NYC tokens
const nycCurrentQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdictions) AS j
  WHERE lower(j) IN (
    'new york city','new_york_city','nyc',
    'new york state','new_york_state','new york',
    'brooklyn','manhattan','queens','bronx','staten island'
  )
  GROUP BY j
  ORDER BY n DESC;
`;
out.nyc_token_presence = (await client.query(nycCurrentQuery)).rows;

// 4. Rows that have ICAO variants in jurisdictions (re-confirm prior count)
const icaoCheckQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdictions) AS j
  WHERE lower(j) LIKE '%icao%' OR lower(j) LIKE '%corsia%'
  GROUP BY j
  ORDER BY n DESC;
`;
out.icao_recheck = (await client.query(icaoCheckQuery)).rows;

// 5. Confirm trigger / function dependency graph as expected
const dependentsQuery = `
  SELECT
    pg_describe_object(classid, objid, objsubid) AS dependent_object
  FROM pg_depend
  WHERE refobjid = (
    SELECT oid FROM pg_proc
    WHERE proname = '_normalize_jurisdictions'
      AND pronamespace = 'public'::regnamespace
    LIMIT 1
  )
  AND deptype = 'n';
`;
out.normalize_function_dependents = (await client.query(dependentsQuery)).rows;

await client.end();
console.log(JSON.stringify(out, null, 2));
