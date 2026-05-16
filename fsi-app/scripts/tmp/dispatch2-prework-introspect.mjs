// One-shot introspection for Dispatch 2 prework (2026-05-15).
// Queries pg_constraint for existing CHECK constraints on the columns
// the dispatch would constrain, plus counts severity-priority lock
// violations. Read-only; safe to re-run.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const DB_PASSWORD = get("SUPABASE_DB_PASSWORD");

// Read the canonical pooler URL from supabase/.temp/pooler-url (the
// pattern used by apply-pending.mjs). This avoids guessing the region.
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

// ── Check 1: existing CHECK constraints on intelligence_items + sources ──
const checksQuery = `
  SELECT
    rel.relname AS table_name,
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname IN ('intelligence_items', 'sources')
    AND con.contype = 'c'
  ORDER BY rel.relname, con.conname;
`;
const checksRes = await client.query(checksQuery);
out.check_constraints = checksRes.rows;

// ── Check 2: severity-priority lock violation count ──
const lockViolQuery = `
  SELECT COUNT(*) AS violations
  FROM intelligence_items
  WHERE severity IS NOT NULL
    AND priority IS DISTINCT FROM CASE severity
      WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
      WHEN 'COST ALERT'        THEN 'HIGH'
      WHEN 'WINDOW CLOSING'    THEN 'HIGH'
      WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
      WHEN 'MONITORING'        THEN 'LOW'
    END;
`;
const lockRes = await client.query(lockViolQuery);
out.severity_priority_violations = parseInt(lockRes.rows[0].violations, 10);

// ── Check 2a: distribution of severity values (for context) ──
const sevDistQuery = `
  SELECT severity, priority, COUNT(*) AS n
  FROM intelligence_items
  GROUP BY severity, priority
  ORDER BY severity NULLS LAST, priority NULLS LAST;
`;
const sevDistRes = await client.query(sevDistQuery);
out.severity_priority_distribution = sevDistRes.rows;

// ── Check 2b: list which (severity, priority) pairs are out of spec ──
const lockViolPairsQuery = `
  SELECT severity, priority, COUNT(*) AS n
  FROM intelligence_items
  WHERE severity IS NOT NULL
    AND priority IS DISTINCT FROM CASE severity
      WHEN 'ACTION REQUIRED'   THEN 'CRITICAL'
      WHEN 'COST ALERT'        THEN 'HIGH'
      WHEN 'WINDOW CLOSING'    THEN 'HIGH'
      WHEN 'COMPETITIVE EDGE'  THEN 'MODERATE'
      WHEN 'MONITORING'        THEN 'LOW'
    END
  GROUP BY severity, priority
  ORDER BY n DESC;
`;
const lockPairsRes = await client.query(lockViolPairsQuery);
out.violating_pairs = lockPairsRes.rows;

// ── Check 3: distinct topic_tags values currently in use + counts ──
const topicTagsQuery = `
  SELECT tag, COUNT(*) AS n
  FROM intelligence_items, unnest(topic_tags) AS tag
  GROUP BY tag
  ORDER BY n DESC;
`;
const topicTagsRes = await client.query(topicTagsQuery);
out.topic_tags_in_use = topicTagsRes.rows;

// ── Check 3a: distinct sources.scope_topics values currently in use ──
const scopeTopicsQuery = `
  SELECT tag, COUNT(*) AS n
  FROM sources, unnest(scope_topics) AS tag
  GROUP BY tag
  ORDER BY n DESC;
`;
const scopeTopicsRes = await client.query(scopeTopicsQuery);
out.sources_scope_topics_in_use = scopeTopicsRes.rows;

// ── Check 3b: distinct compliance_object_tags values currently in use ──
const complianceTagsQuery = `
  SELECT tag, COUNT(*) AS n
  FROM intelligence_items, unnest(compliance_object_tags) AS tag
  GROUP BY tag
  ORDER BY n DESC;
`;
const complianceTagsRes = await client.query(complianceTagsQuery);
out.compliance_object_tags_in_use = complianceTagsRes.rows;

// ── Check 3c: distinct operational_scenario_tags values currently in use ──
const opScenarioTagsQuery = `
  SELECT tag, COUNT(*) AS n
  FROM intelligence_items, unnest(operational_scenario_tags) AS tag
  GROUP BY tag
  ORDER BY n DESC
  LIMIT 100;
`;
const opScenarioTagsRes = await client.query(opScenarioTagsQuery);
out.operational_scenario_tags_top_100 = opScenarioTagsRes.rows;

// ── Check 4: total row count for context ──
const rowCountQuery = `SELECT COUNT(*) AS n FROM intelligence_items;`;
const rowCountRes = await client.query(rowCountQuery);
out.intelligence_items_total = parseInt(rowCountRes.rows[0].n, 10);

const sourcesCountQuery = `SELECT COUNT(*) AS n FROM sources;`;
const sourcesCountRes = await client.query(sourcesCountQuery);
out.sources_total = parseInt(sourcesCountRes.rows[0].n, 10);

await client.end();

console.log(JSON.stringify(out, null, 2));
