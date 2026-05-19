// Q2 pre-flight probe: inspect sources tier-related columns + tier distribution + check constraints.

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
  out.tier_related_columns = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sources'
      AND column_name IN ('tier', 'base_tier', 'effective_tier', 'tier_override', 'override_reason', 'override_date')
    ORDER BY column_name
  `)).rows;

  out.sources_count = (await client.query("SELECT COUNT(*)::int AS n FROM public.sources")).rows[0].n;

  out.tier_distribution = (await client.query(
    "SELECT tier, COUNT(*)::int AS n FROM public.sources GROUP BY tier ORDER BY tier NULLS LAST"
  )).rows;

  out.tier_check_constraints = (await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.sources'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tier%'
  `)).rows;

  out.tier_dependent_objects = (await client.query(`
    SELECT DISTINCT
      d.classid::regclass AS object_type,
      CASE WHEN d.classid = 'pg_proc'::regclass THEN (SELECT p.proname FROM pg_proc p WHERE p.oid = d.objid)
           WHEN d.classid = 'pg_rewrite'::regclass THEN (SELECT r.rulename || ' on ' || c.relname FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class WHERE r.oid = d.objid)
           WHEN d.classid = 'pg_constraint'::regclass THEN (SELECT con.conname FROM pg_constraint con WHERE con.oid = d.objid)
           WHEN d.classid = 'pg_trigger'::regclass THEN (SELECT t.tgname FROM pg_trigger t WHERE t.oid = d.objid)
           ELSE d.objid::text END AS object_name
    FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.refobjid = 'public.sources'::regclass
      AND a.attname = 'tier'
      AND d.deptype != 'i'
  `)).rows;
} catch (err) {
  out.error = err.message;
  out.stack = err.stack;
} finally {
  await client.end();
  console.log(JSON.stringify(out, null, 2));
}
