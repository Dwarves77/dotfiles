// Q2 pre-flight: inspect the two views that depend on sources.tier
// so the migration can drop+recreate them around the rename.

import { readFileSync } from "node:fs";
import pg from "pg";

const DB_PASSWORD = readFileSync(".env.local", "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync("supabase/.temp/pooler-url", "utf8").trim();
const PROJECT_REF = readFileSync("supabase/.temp/project-ref", "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};
try {
  out.provisional_sources_review = (await client.query(`
    SELECT pg_get_viewdef('public.provisional_sources_review'::regclass, true) AS def
  `)).rows[0];

  out.source_health_summary = (await client.query(`
    SELECT pg_get_viewdef('public.source_health_summary'::regclass, true) AS def
  `)).rows[0];

  out.view_metadata = (await client.query(`
    SELECT relname, relkind FROM pg_class
    WHERE relname IN ('provisional_sources_review', 'source_health_summary')
      AND relnamespace = 'public'::regnamespace
  `)).rows;
} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
