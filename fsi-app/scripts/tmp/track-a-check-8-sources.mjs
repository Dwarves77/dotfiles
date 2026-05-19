// Track A pre-flight A1: live DB check for the 8 analytical-press sources.
//
// Reads .env.local + supabase/.temp config from the main repo (gitignored),
// then queries public.sources for the 8 named sources by exact name AND
// fuzzy ILIKE match. Also enumerates NOT NULL columns in public.sources.
//
// Pattern: OBS-12 canonical (d16-investigate.mjs).

import { readFileSync } from "node:fs";
import pg from "pg";

const MAIN_REPO = "C:/Users/jason/dotfiles/fsi-app";

const DB_PASSWORD = readFileSync(`${MAIN_REPO}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${MAIN_REPO}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${MAIN_REPO}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const EXACT_NAMES = [
  "Loadstar",
  "FreightWaves Sustainability",
  "Edie",
  "GreenBiz",
  "Environmental Finance",
  "Splash247 Green",
  "Supply Chain Digital",
  "Reuters Sustainable Business",
];

const ILIKE_PATTERNS = [
  "%loadstar%",
  "%freightwaves%",
  "%edie%",
  "%greenbiz%",
  "%environmental finance%",
  "%splash247%",
  "%supply chain digital%",
  "%reuters sustainable%",
];

const client = new pg.Client({ connectionString });
await client.connect();
const out = {};

try {
  // 1. Exact-name match
  out.exact_match = (await client.query(
    `SELECT id, name, category, source_role, tier, jurisdictions, tier_at_creation
     FROM public.sources
     WHERE name = ANY($1::text[])
     ORDER BY name`,
    [EXACT_NAMES]
  )).rows;

  // 2. Fuzzy ILIKE match (catches near-misses like 'Reuters' alone)
  out.fuzzy_match = (await client.query(
    `SELECT id, name, category, source_role, tier, jurisdictions, tier_at_creation
     FROM public.sources
     WHERE name ILIKE ANY($1::text[])
     ORDER BY name`,
    [ILIKE_PATTERNS]
  )).rows;

  // 3. NOT NULL columns on sources (critical for INSERT-if-missing)
  out.not_null_columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources'
      AND is_nullable = 'NO'
    ORDER BY ordinal_position
  `)).rows;

  // 4. All sources columns (for INSERT shape awareness)
  out.all_columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sources'
    ORDER BY ordinal_position
  `)).rows;

  // 5. CHECK constraints on sources (verify no source_role CHECK exists)
  out.checks = (await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass AND contype = 'c'
    ORDER BY conname
  `)).rows;

  // 6. Indexes (for ON CONFLICT viability via unique constraints)
  out.unique_constraints = (await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass AND contype IN ('u', 'p')
    ORDER BY conname
  `)).rows;

} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
