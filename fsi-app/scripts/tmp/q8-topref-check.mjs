import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
const DB_PASSWORD = readFileSync(resolve(process.cwd(), ".env.local"), "utf8").match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
const cs = POOLER_URL.replace(`postgres.${PROJECT_REF}@`, `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: cs });
await c.connect();
const r = await c.query(`
  SELECT s.id, s.name, s.tier,
    count(ii.*)::int AS cnt,
    max(ii.added_date) AS recency
  FROM sources s
  LEFT JOIN intelligence_items ii ON ii.source_id = s.id OR ii.sources_used @> ARRAY[s.id]::uuid[]
  GROUP BY s.id
  HAVING count(ii.*) > 5
  ORDER BY count(ii.*) DESC
  LIMIT 5;
`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
