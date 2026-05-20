// Pre-flight DB schema check for Phase 1.5 consumer migration.
// Verifies:
//   - sources.tier exists (shim still present)
//   - sources.base_tier + sources.effective_tier exist (Q2 columns)
//   - sources.tier_override exists (Q5 column)
//   - shim trigger sources_sync_tier_columns exists
//   - source_trust_events.event_type CHECK definition

import { readFileSync } from "node:fs";
import pg from "pg";

const ENV_PATH = "C:/Users/jason/dotfiles/fsi-app/.env.local";
const env = readFileSync(ENV_PATH, "utf8");
const DB_PASSWORD = env.match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
// pooler-url + project-ref live in main repo (worktree shares supabase/ dir).
const POOLER_URL = readFileSync("C:/Users/jason/dotfiles/fsi-app/supabase/.temp/pooler-url", "utf8").trim();
const PROJECT_REF = readFileSync("C:/Users/jason/dotfiles/fsi-app/supabase/.temp/project-ref", "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();

console.log(`\n=== Pre-flight schema check ===\n`);

const cols = await client.query(`
  SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sources'
     AND column_name IN ('tier','base_tier','effective_tier','tier_override','override_reason','override_date')
   ORDER BY column_name;
`);
console.log("sources columns:");
console.table(cols.rows);

const trig = await client.query(`
  SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
   WHERE tgrelid = 'public.sources'::regclass
     AND NOT tgisinternal;
`);
console.log("\nsources triggers:");
console.table(trig.rows);

const check = await client.query(`
  SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
   WHERE nsp.nspname = 'public'
     AND cls.relname = 'source_trust_events'
     AND con.contype = 'c';
`);
console.log("\nsource_trust_events CHECK constraints:");
console.table(check.rows);

const sample = await client.query(`
  SELECT id, name, base_tier, effective_tier, tier, tier_override
    FROM public.sources
   ORDER BY base_tier ASC NULLS LAST
   LIMIT 3;
`);
console.log("\nSample sources (3):");
console.table(sample.rows);

const counts = await client.query(`
  SELECT count(*) AS total,
         count(*) FILTER (WHERE tier IS NOT NULL) AS with_tier,
         count(*) FILTER (WHERE base_tier IS NOT NULL) AS with_base_tier,
         count(*) FILTER (WHERE effective_tier IS NOT NULL) AS with_effective_tier,
         count(*) FILTER (WHERE tier IS DISTINCT FROM base_tier) AS tier_neq_base_tier
    FROM public.sources;
`);
console.log("\nSources counts:");
console.table(counts.rows);

// Migration ledger
const ledger = await client.query(`
  SELECT version, name FROM supabase_migrations.schema_migrations
   WHERE version IN ('090','091','092','093','094','095','096')
   ORDER BY version;
`);
console.log("\nMigration ledger (relevant):");
console.table(ledger.rows);

await client.end();
console.log("\nDone.");
