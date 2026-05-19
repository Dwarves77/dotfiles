// Q10: apply migration 087 (canonicalize sources.url + provisional_sources.url
// + intelligence_items.source_url). Backfills schema_migrations ledger.

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
  const sql = readFileSync(
    "supabase/migrations/087_canonicalize_source_urls.sql",
    "utf8"
  );

  // Pre-state counts.
  out.pre_state = {
    sources: (await client.query("SELECT COUNT(*) AS n FROM public.sources")).rows[0].n,
    provisional_sources: (await client.query("SELECT COUNT(*) AS n FROM public.provisional_sources")).rows[0].n,
    intelligence_items_with_source_url: (await client.query(
      "SELECT COUNT(*) AS n FROM public.intelligence_items WHERE source_url IS NOT NULL AND source_url <> ''"
    )).rows[0].n,
  };

  await client.query(sql);
  out.applied = true;

  // Backfill ledger.
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES ('087', 'canonicalize_source_urls', NULL)
     ON CONFLICT (version) DO NOTHING`
  );
  out.ledger_backfilled = true;

  // Post-state: confirm column comments and a spot-check of canonicalized URLs.
  out.column_comments = (await client.query(`
    SELECT a.attname AS col, col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a
    WHERE a.attrelid IN ('public.sources'::regclass, 'public.provisional_sources'::regclass)
      AND a.attname = 'url'
    ORDER BY a.attrelid::text, a.attname
  `)).rows;

  // Sample a few rows that were known duplicates to confirm canonicalization.
  out.spot_check = (await client.query(`
    SELECT id, url FROM public.sources
    WHERE url IN (
      'https://freightwaves.com', 'https://www.freightwaves.com', 'https://www.freightwaves.com/',
      'https://splash247.com', 'https://splash247.com/',
      'https://breeam.com', 'https://www.breeam.com', 'https://www.breeam.com/'
    )
    ORDER BY url
  `)).rows;

  out.post_state = {
    sources: (await client.query("SELECT COUNT(*) AS n FROM public.sources")).rows[0].n,
    provisional_sources: (await client.query("SELECT COUNT(*) AS n FROM public.provisional_sources")).rows[0].n,
  };
} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
