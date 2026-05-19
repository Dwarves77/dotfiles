// Q8 probe: discover the intelligence_items column suited for recency.
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

const r = await client.query(`
  SELECT column_name, data_type, udt_name
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'intelligence_items'
     AND (column_name LIKE '%date%' OR column_name LIKE '%_at' OR column_name LIKE '%publish%' OR column_name = 'sources_used' OR column_name = 'source_id')
   ORDER BY column_name;
`);
console.log(JSON.stringify(r.rows, null, 2));
await client.end();
