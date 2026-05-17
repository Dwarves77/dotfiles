// Sprint 1 Phase 4 prework: ICAO/CORSIA/aviation counts + staged_updates
// pre-flight on dedup losers.

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

// ── ICAO/CORSIA/aviation in intelligence_items.jurisdictions
const icaoJurQuery = `
  SELECT j AS value, COUNT(*) AS n
  FROM intelligence_items, unnest(jurisdictions) AS j
  WHERE j ILIKE '%icao%' OR j ILIKE '%corsia%' OR j ILIKE '%aviation%'
  GROUP BY j
  ORDER BY n DESC;
`;
out.icao_jurisdictions = (await client.query(icaoJurQuery)).rows;

// ── ICAO/CORSIA in title or full_brief or topic_tags (rows that should be
//    tagged ICAO at jurisdiction level but currently aren't)
const icaoContentQuery = `
  SELECT
    COUNT(*) FILTER (WHERE title ILIKE '%icao%' OR title ILIKE '%corsia%') AS title_match,
    COUNT(*) FILTER (WHERE full_brief ILIKE '%icao%' OR full_brief ILIKE '%corsia%') AS brief_match,
    COUNT(*) FILTER (WHERE 'aviation' = ANY(topic_tags) OR 'air' = ANY(topic_tags)) AS aviation_topic_tag
  FROM intelligence_items;
`;
out.icao_content_counts = (await client.query(icaoContentQuery)).rows[0];

// ── Rows tagged ICAO/aviation in content but not in jurisdictions array
const icaoMissingJurQuery = `
  SELECT id, legacy_id, title, jurisdictions, jurisdiction_iso
  FROM intelligence_items
  WHERE (title ILIKE '%icao%' OR title ILIKE '%corsia%')
    AND NOT (
      'ICAO' = ANY(jurisdictions)
      OR 'ICAO' = ANY(jurisdiction_iso)
    )
  ORDER BY created_at DESC
  LIMIT 30;
`;
out.icao_missing_jurisdiction = (await client.query(icaoMissingJurQuery)).rows;

// ── staged_updates pre-flight on dedup losers
// Loser IDs from Phase 2:
// LL97 losers: b8b6fde3..., d56ca4e1...
// EPA Phase 3 losers: 33ca228c..., bec305e1...
// EU Auto: no losers (only 1 row)
// Norway Fjords loser: 82f09535...
// Matrix Hudson loser: daaa7e3a...
const loserIds = [
  'b8b6fde3-f7a8-4901-2345-678901234567',  // placeholder, need real UUIDs
];
// Need to fetch actual UUIDs since I only have prefixes
const loserUuidQuery = `
  SELECT id, title FROM intelligence_items
  WHERE id::text LIKE 'b8b6fde3%'
     OR id::text LIKE 'd56ca4e1%'
     OR id::text LIKE '33ca228c%'
     OR id::text LIKE 'bec305e1%'
     OR id::text LIKE '82f09535%'
     OR id::text LIKE 'daaa7e3a%';
`;
const loserRes = await client.query(loserUuidQuery);
out.loser_uuids = loserRes.rows;

const realLoserIds = loserRes.rows.map(r => r.id);
if (realLoserIds.length > 0) {
  const stagedCheckQuery = `
    SELECT id, item_id, update_type, status, created_at
    FROM staged_updates
    WHERE item_id = ANY($1::uuid[])
       OR materialized_item_id = ANY($1::uuid[]);
  `;
  const stagedRes = await client.query(stagedCheckQuery, [realLoserIds]);
  out.staged_updates_on_losers = stagedRes.rows;
}

// ── Cross-check: pending_jurisdiction_review count estimate
// 48 continents + 24 region buckets + 7 undefined orgs (12 - 5 OECD/ASEAN accepts) = 79
const continentRowsQuery = `
  SELECT COUNT(DISTINCT id) AS n_rows
  FROM intelligence_items
  WHERE jurisdictions && ARRAY['ASIA', 'EUROPE', 'AFRICA', 'NORTH AMERICA', 'SOUTH AMERICA', 'OCEANIA']::text[];
`;
out.continent_distinct_rows = parseInt((await client.query(continentRowsQuery)).rows[0].n_rows, 10);

const regionRowsQuery = `
  SELECT COUNT(DISTINCT id) AS n_rows
  FROM intelligence_items
  WHERE jurisdictions && ARRAY['LATAM','LATIN AMERICA','LATIN_AMERICA','MEAF','MIDDLE EAST','MIDDLE EAST AND AFRICA','NORTH_AMERICA','SOUTH_AMERICA','ASIA PACIFIC','ASIA_PACIFIC','ASIA-PACIFIC','APAC','EMEA','EMEAS','ANZ','PACIFIC RIM','SUBSAHARAN AFRICA','EASTERN EUROPE','WESTERN EUROPE','CENTRAL ASIA','SOUTHEAST ASIA','SOUTH ASIA','EAST ASIA','MENA','NORDIC','BALKANS','CARIBBEAN','AMERICAS','EAST_ASIA_PACIFIC','EUROPE_CENTRAL_ASIA','LATIN_AMERICA_CARIBBEAN','MIDDLE_EAST_NORTH_AFRICA','SOUTH_ASIA']::text[];
`;
out.region_distinct_rows = parseInt((await client.query(regionRowsQuery)).rows[0].n_rows, 10);

const undefGroupRowsQuery = `
  SELECT COUNT(DISTINCT id) AS n_rows
  FROM intelligence_items
  WHERE jurisdictions && ARRAY['DEVELOPING_COUNTRIES','DEVELOPING COUNTRIES','ASIAN_DEVELOPMENT_BANK_MEMBERS','ASIAN DEVELOPMENT BANK MEMBERS','G7','G20','BRICS','UN_MEMBER_STATES','EU_MEMBER_STATES','EU MEMBER STATES','BALTIC_REGION','BALTIC REGION','NORTHEAST_REGION','NORTHEAST REGION','MERCOSUR','COMMONWEALTH','EEA','OECD_MEMBER_STATES','OECD MEMBER STATES','EASA_MEMBER_STATES','EASA MEMBER STATES','UN MEMBER STATES','ICAO MEMBER STATES (193)','IEA MEMBER STATES','IMO MEMBER STATES','IMO_MEMBER_STATES','SMALL_ISLAND_DEVELOPING_STATES','MULTIPLE STATES','MULTI-STATE','MULTI-JURISDICTIONAL','ALL US STATES','EUROPEAN UNION MEMBER STATES']::text[];
`;
out.undefined_group_distinct_rows = parseInt((await client.query(undefGroupRowsQuery)).rows[0].n_rows, 10);

await client.end();
console.log(JSON.stringify(out, null, 2));
