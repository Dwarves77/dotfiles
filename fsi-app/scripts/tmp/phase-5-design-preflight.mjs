// Phase 5 design pre-flight introspection.
// Reconfirms or revises the counts referenced by docs/sprint-1/phase-5-design.md:
//   1. NYC token row counts per token, total distinct items
//   2. Empty jurisdiction_iso row count with non-empty jurisdictions
//   3. RC-9 loser UUID presence per cluster (LL97, EPA Phase 3, Norway Fjords, Matrix Hudson)
//   4. item_cross_references row counts referencing any loser UUID
//   5. item_supersessions table existence (information_schema)
//   6. OBS-2 validation-shape audit: surface valid-shape-but-invalid-content tokens

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
const out = {};

// Loser UUID fragments from docs/sprint-1/phase-2-dedup-plan.md.
// Stored as 8-char prefixes; the queries widen via LIKE for safety against
// any latent rename / dedup that may have happened.
const LOSER_UUID_PREFIXES = {
  LL97: ["b8b6fde3", "d56ca4e1"],
  EPA_PHASE_3: ["33ca228c", "bec305e1"],
  NORWAY_FJORDS: ["82f09535"],
  MATRIX_HUDSON: ["daaa7e3a"]
};

const NYC_TOKENS = [
  "NEW YORK CITY",
  "NEW_YORK_CITY",
  "NYC",
  "BROOKLYN",
  "MANHATTAN",
  "QUEENS",
  "BRONX",
  "STATEN ISLAND",
  "STATEN_ISLAND",
  "THE BRONX"
];

// ─── 1. NYC token row counts ───────────────────────────────────────────
// Per-token breakdown across jurisdictions OR jurisdiction_iso, plus the
// total distinct intelligence_items count.

const perTokenCounts = {};
for (const tok of NYC_TOKENS) {
  const res = await client.query(
    `SELECT COUNT(DISTINCT ii.id)::int AS n
     FROM public.intelligence_items ii
     WHERE EXISTS (SELECT 1 FROM unnest(ii.jurisdictions) j WHERE upper(j) = upper($1))
        OR EXISTS (SELECT 1 FROM unnest(ii.jurisdiction_iso) j WHERE upper(j) = upper($1));`,
    [tok]
  );
  perTokenCounts[tok] = res.rows[0].n;
}
out.nyc_per_token = perTokenCounts;

const totalDistinctNyc = await client.query(
  `SELECT COUNT(DISTINCT ii.id)::int AS n
   FROM public.intelligence_items ii
   WHERE EXISTS (
     SELECT 1 FROM unnest(ii.jurisdictions) j
     WHERE upper(j) = ANY($1::text[])
   )
   OR EXISTS (
     SELECT 1 FROM unnest(ii.jurisdiction_iso) j
     WHERE upper(j) = ANY($1::text[])
   );`,
  [NYC_TOKENS.map((t) => t.toUpperCase())]
);
out.nyc_total_distinct_items = totalDistinctNyc.rows[0].n;

// ─── 2. ISO-empty row count ────────────────────────────────────────────
// Non-empty jurisdictions, empty (NULL or empty-array) jurisdiction_iso.

const isoEmptyRes = await client.query(
  `SELECT COUNT(*)::int AS n
   FROM public.intelligence_items ii
   WHERE (jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0)
     AND jurisdictions IS NOT NULL
     AND cardinality(jurisdictions) > 0;`
);
out.iso_empty_with_jurisdictions = isoEmptyRes.rows[0].n;

const isoFullyEmpty = await client.query(
  `SELECT COUNT(*)::int AS n
   FROM public.intelligence_items ii
   WHERE jurisdiction_iso IS NULL OR cardinality(jurisdiction_iso) = 0;`
);
out.iso_fully_empty_total = isoFullyEmpty.rows[0].n;

// ─── 3. RC-9 loser-row presence ────────────────────────────────────────

const losersFound = {};
for (const [cluster, prefixes] of Object.entries(LOSER_UUID_PREFIXES)) {
  const rows = [];
  for (const pfx of prefixes) {
    const res = await client.query(
      `SELECT id, title, item_type, jurisdictions, jurisdiction_iso, created_at,
              cardinality(COALESCE(jurisdictions, ARRAY[]::text[])) AS j_n,
              cardinality(COALESCE(jurisdiction_iso, ARRAY[]::text[])) AS iso_n
       FROM public.intelligence_items
       WHERE id::text LIKE $1
       LIMIT 5;`,
      [`${pfx}%`]
    );
    rows.push({ prefix: pfx, present: res.rows.length, sample: res.rows });
  }
  losersFound[cluster] = rows;
}
out.rc9_loser_presence = losersFound;

// ─── 4. item_cross_references FK rewrite count ─────────────────────────
// Confirm table name first (some schemas use item_cross_references,
// others may have renamed it). Then count rows where source_item_id or
// target_item_id matches any loser UUID prefix.

const xrefTableProbe = await client.query(
  `SELECT table_name, column_name
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name LIKE '%cross_reference%'
   ORDER BY table_name, ordinal_position;`
);
out.xref_table_probe = xrefTableProbe.rows;

const allLoserPrefixes = Object.values(LOSER_UUID_PREFIXES).flat();
const xrefHits = [];
for (const pfx of allLoserPrefixes) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n_source, 0 AS n_target
     FROM public.item_cross_references
     WHERE source_item_id::text LIKE $1
     UNION ALL
     SELECT 0 AS n_source, COUNT(*)::int AS n_target
     FROM public.item_cross_references
     WHERE target_item_id::text LIKE $1;`,
    [`${pfx}%`]
  );
  const nSource = res.rows[0]?.n_source ?? 0;
  const nTarget = res.rows[1]?.n_target ?? 0;
  if (nSource > 0 || nTarget > 0) {
    xrefHits.push({ prefix: pfx, source_refs: nSource, target_refs: nTarget });
  }
}
out.xref_loser_hits = xrefHits;

// ─── 5. item_supersessions table existence ─────────────────────────────

const supersessionsTable = await client.query(
  `SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'item_supersessions'
   ORDER BY ordinal_position;`
);
out.item_supersessions_columns = supersessionsTable.rows;
out.item_supersessions_exists = supersessionsTable.rows.length > 0;

if (out.item_supersessions_exists) {
  const ssCount = await client.query(
    `SELECT COUNT(*)::int AS n FROM public.item_supersessions;`
  );
  out.item_supersessions_row_count = ssCount.rows[0].n;
}

// ─── 6. OBS-2 validation-shape audit ───────────────────────────────────
// Tokens that pass the shape regex but are not in the operator-known
// canonical set. We seed a reject list with common non-ISO 2-letter and
// shape-only ISO-3166-2 strings, then scan canonical arrays for them.

// 6a. 2-letter ALL-CAPS tokens in canonical arrays that are NOT in the
// known ISO 3166-1 canonical set + platform canonical free-text.
// We pull all distinct 2-letter codes and surface ones that are obvious
// rejects (XX, ZZ, QQ, etc.).
const knownTwoLetterRes = await client.query(
  `SELECT DISTINCT j AS code
   FROM public.intelligence_items, unnest(jurisdictions) AS j
   WHERE j ~ '^[A-Z]{2}$'
   UNION
   SELECT DISTINCT j AS code
   FROM public.intelligence_items, unnest(jurisdiction_iso) AS j
   WHERE j ~ '^[A-Z]{2}$'
   ORDER BY code;`
);
out.distinct_two_letter_tokens = knownTwoLetterRes.rows.map((r) => r.code);

// Hand reject list: obvious non-ISO codes that the soft validator would
// pass through. EU is a known canonical free-text (not ISO 3166-1 but
// platform-canonical), so it stays out of the reject list.
const TWO_LETTER_REJECT_SAMPLE = ["XX", "ZZ", "QQ", "AA", "BB", "OO", "ZX"];
const twoLetterSuspects = [];
for (const code of TWO_LETTER_REJECT_SAMPLE) {
  const r = await client.query(
    `SELECT id, title FROM public.intelligence_items
     WHERE $1 = ANY(jurisdictions) OR $1 = ANY(jurisdiction_iso)
     LIMIT 3;`,
    [code]
  );
  if (r.rows.length > 0) {
    twoLetterSuspects.push({ token: code, items: r.rows });
  }
}
out.two_letter_invalid_content_hits = twoLetterSuspects;

// 6b. ISO 3166-2 shape but obviously invalid subdivision (XX-YYZZ,
// US-ZZZZ, etc.). We list all distinct shape-matching codes and the
// caller eyeballs them in the design doc.
const subdivRes = await client.query(
  `SELECT DISTINCT j AS code, COUNT(*)::int AS n
   FROM public.intelligence_items, unnest(jurisdictions) AS j
   WHERE j ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
   GROUP BY j
   UNION
   SELECT DISTINCT j AS code, COUNT(*)::int AS n
   FROM public.intelligence_items, unnest(jurisdiction_iso) AS j
   WHERE j ~ '^[A-Z]{2}-[A-Z0-9]{1,4}$'
   GROUP BY j
   ORDER BY code;`
);
out.distinct_iso_3166_2_shape_tokens = subdivRes.rows;

// Hand reject list: known invalid subdivision codes for audit surface.
const SUBDIV_REJECT_SAMPLE = ["US-ZZZZ", "US-XX", "GB-ZZ", "XX-YYZZ", "AA-AA"];
const subdivSuspects = [];
for (const code of SUBDIV_REJECT_SAMPLE) {
  const r = await client.query(
    `SELECT id, title FROM public.intelligence_items
     WHERE $1 = ANY(jurisdictions) OR $1 = ANY(jurisdiction_iso)
     LIMIT 3;`,
    [code]
  );
  if (r.rows.length > 0) {
    subdivSuspects.push({ token: code, items: r.rows });
  }
}
out.iso_3166_2_invalid_content_hits = subdivSuspects;

// ─── Tail metadata ─────────────────────────────────────────────────────
out._run_at = new Date().toISOString();
out._notes = [
  "NYC counts include both jurisdictions and jurisdiction_iso array containers.",
  "Loser UUID matches use 8-char LIKE prefixes; collisions are unlikely with random uuids.",
  "OBS-2 surface uses a hand-built reject sample (XX/ZZ/QQ/etc.); not exhaustive."
];

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/phase-5-design-preflight.json"),
  JSON.stringify(out, null, 2)
);

console.log(JSON.stringify(out, null, 2));
await client.end();
