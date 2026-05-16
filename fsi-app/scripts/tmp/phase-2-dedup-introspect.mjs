// Sprint 1 Phase 2 introspection.
// Read-only queries against the live DB to support the canonical-entity
// dedup plan. No writes. Connection pattern mirrors
// dispatch2-prework-introspect.mjs.

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

// ── Q1: pg_constraint live introspection of every FK that references intelligence_items
const fkQuery = `
  SELECT
    cl.relname AS referencing_table,
    a.attname AS referencing_column,
    con.conname AS constraint_name,
    con.confdeltype AS on_delete_action,
    con.confupdtype AS on_update_action
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_class cf ON cf.oid = con.confrelid
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
  WHERE con.contype = 'f'
    AND cf.relname = 'intelligence_items'
  ORDER BY cl.relname, a.attname;
`;
const fkRes = await client.query(fkQuery);
out.fk_references_to_intelligence_items = fkRes.rows.map((r) => ({
  ...r,
  on_delete: { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" }[r.on_delete_action] || r.on_delete_action,
}));

// ── Q2: distinct item_type values + counts
const itemTypeQuery = `
  SELECT item_type, COUNT(*) AS n
  FROM intelligence_items
  GROUP BY item_type
  ORDER BY n DESC;
`;
const itemTypeRes = await client.query(itemTypeQuery);
out.item_type_distribution = itemTypeRes.rows;

// ── Q3: total regulation count
const regCountQuery = `
  SELECT COUNT(*) AS n FROM intelligence_items WHERE item_type = 'regulation';
`;
const regCountRes = await client.query(regCountQuery);
out.regulation_total = parseInt(regCountRes.rows[0].n, 10);

// ── Q4: existing constraint posture on intelligence_items (after migrations 075-078)
const checkQuery = `
  SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  WHERE cl.relname = 'intelligence_items'
    AND con.contype IN ('c', 'u', 'p')
  ORDER BY con.contype, con.conname;
`;
const checkRes = await client.query(checkQuery);
out.intelligence_items_constraints = checkRes.rows;

// ── Q5: existing columns on intelligence_items (to know if instrument_identifier already exists)
const colsQuery = `
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'intelligence_items'
  ORDER BY ordinal_position;
`;
const colsRes = await client.query(colsQuery);
out.intelligence_items_columns = colsRes.rows;

// ── Q6: the LL97 cluster (3 records). Find by title pattern; capture id, legacy_id, title, body length, source_url, jurisdiction, item_type, severity, priority, created_at, updated_at
const ll97Query = `
  SELECT
    id, legacy_id, title,
    LENGTH(COALESCE(full_brief, '')) AS full_brief_len,
    LENGTH(COALESCE(summary, '')) AS summary_len,
    LENGTH(COALESCE(what_is_it, '')) AS what_is_it_len,
    LENGTH(COALESCE(why_matters, '')) AS why_matters_len,
    source_url, source_id, jurisdictions, jurisdiction_iso,
    item_type, severity, priority, status,
    created_at, updated_at, last_regenerated_at
  FROM intelligence_items
  WHERE title ILIKE '%local law 97%'
     OR title ILIKE '%LL97%'
  ORDER BY created_at;
`;
const ll97Res = await client.query(ll97Query);
out.cluster_ll97 = ll97Res.rows;

// ── Q7: the EPA Phase 3 HDV cluster (4 records per audit)
const epaQuery = `
  SELECT
    id, legacy_id, title,
    LENGTH(COALESCE(full_brief, '')) AS full_brief_len,
    LENGTH(COALESCE(summary, '')) AS summary_len,
    source_url, source_id, jurisdictions, jurisdiction_iso,
    item_type, severity, priority, status,
    created_at, updated_at, last_regenerated_at
  FROM intelligence_items
  WHERE title ILIKE '%phase 3%heavy%' OR title ILIKE '%heavy-duty%phase 3%' OR title ILIKE '%EPA%phase 3%' OR title ILIKE '%HDV%phase 3%' OR title ILIKE '%greenhouse gas emissions standards for heavy%'
  ORDER BY created_at;
`;
const epaRes = await client.query(epaQuery);
out.cluster_epa_phase3 = epaRes.rows;

// ── Q8: EU Automotive Package cluster (2 records per audit)
const euAutoQuery = `
  SELECT
    id, legacy_id, title,
    LENGTH(COALESCE(full_brief, '')) AS full_brief_len,
    source_url, source_id, jurisdictions, jurisdiction_iso,
    item_type, severity, priority, status, created_at
  FROM intelligence_items
  WHERE title ILIKE '%EU%automotive%' OR title ILIKE '%automotive package%' OR title ILIKE '%heavy-duty vehicle co2%' OR title ILIKE '%EU Heavy-Duty%'
  ORDER BY created_at;
`;
const euAutoRes = await client.query(euAutoQuery);
out.cluster_eu_automotive = euAutoRes.rows;

// ── Q9: Norway World Heritage Fjords cluster (2 records per audit)
const norwayQuery = `
  SELECT
    id, legacy_id, title,
    LENGTH(COALESCE(full_brief, '')) AS full_brief_len,
    source_url, source_id, jurisdictions, jurisdiction_iso,
    item_type, severity, priority, status, created_at
  FROM intelligence_items
  WHERE title ILIKE '%fjord%' OR title ILIKE '%norway%heritage%' OR title ILIKE '%zero-emission requirements%world heritage%'
  ORDER BY created_at;
`;
const norwayRes = await client.query(norwayQuery);
out.cluster_norway_fjords = norwayRes.rows;

// ── Q10: Matrix Hudson cluster (2 records per audit)
const matrixQuery = `
  SELECT
    id, legacy_id, title,
    LENGTH(COALESCE(full_brief, '')) AS full_brief_len,
    source_url, source_id, jurisdictions, jurisdiction_iso,
    item_type, severity, priority, status, created_at
  FROM intelligence_items
  WHERE title ILIKE '%matrix hudson%'
  ORDER BY created_at;
`;
const matrixRes = await client.query(matrixQuery);
out.cluster_matrix_hudson = matrixRes.rows;

// ── Q11: For each cluster row id, count FK references in each referencing table.
//        This estimates the FK remap workload per cluster.
const clusterIds = [
  ...out.cluster_ll97.map((r) => r.id),
  ...out.cluster_epa_phase3.map((r) => r.id),
  ...out.cluster_eu_automotive.map((r) => r.id),
  ...out.cluster_norway_fjords.map((r) => r.id),
  ...out.cluster_matrix_hudson.map((r) => r.id),
];

if (clusterIds.length > 0) {
  const fkCounts = {};
  // For each FK referencing table+column, count rows per id in the cluster.
  // The FK list comes from Q1 above.
  for (const fk of out.fk_references_to_intelligence_items) {
    const { referencing_table, referencing_column } = fk;
    const sql = `
      SELECT "${referencing_column}" AS item_id, COUNT(*) AS n
      FROM "${referencing_table}"
      WHERE "${referencing_column}" = ANY($1::uuid[])
      GROUP BY "${referencing_column}";
    `;
    try {
      const r = await client.query(sql, [clusterIds]);
      const key = `${referencing_table}.${referencing_column}`;
      fkCounts[key] = r.rows;
    } catch (e) {
      const key = `${referencing_table}.${referencing_column}`;
      fkCounts[key] = { error: e.message };
    }
  }
  out.fk_row_counts_per_cluster_id = fkCounts;
}

// ── Q12: Are intelligence_summaries and intelligence_changes empty / have FK constraint?
const intelChangesQuery = `
  SELECT 'intelligence_summaries' AS t, COUNT(*) AS n FROM intelligence_summaries
  UNION ALL
  SELECT 'intelligence_changes' AS t, COUNT(*) AS n FROM intelligence_changes;
`;
try {
  const r = await client.query(intelChangesQuery);
  out.unconstrained_fk_table_counts = r.rows;
} catch (e) {
  out.unconstrained_fk_table_counts = { error: e.message };
}

// ── Q13: sample of regulation rows to inspect their natural identifiers for instrument_identifier picking rules
const sampleQuery = `
  SELECT id, legacy_id, title, source_url, jurisdictions, jurisdiction_iso, severity, priority, created_at
  FROM intelligence_items
  WHERE item_type = 'regulation'
  ORDER BY created_at DESC
  LIMIT 30;
`;
const sampleRes = await client.query(sampleQuery);
out.regulation_sample_recent = sampleRes.rows;

await client.end();

console.log(JSON.stringify(out, null, 2));
