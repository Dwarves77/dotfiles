// Migration 093 apply: executes the migration SQL as a single client call,
// then writes a row to supabase_migrations.schema_migrations to match
// existing entries' format. Reports verification queries.
//
// Pattern per scripts/tmp/q8-apply-088.mjs and per OBS-12.

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

const migrationPath = resolve(process.cwd(), "supabase/migrations/093_sources_tier_override.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({ connectionString });
await client.connect();

const out = {
  generated_at: new Date().toISOString(),
  migration_path: migrationPath,
};

// Pre-apply: confirm columns do not already exist on sources, and capture
// current source_trust_events.event_type CHECK constraint definition.
const preColRes = await client.query(
  `SELECT column_name
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sources'
      AND column_name IN ('tier_override', 'override_reason', 'override_date');`
);
out.sources_override_columns_pre = preColRes.rows.map((r) => r.column_name);

const preChkRes = await client.query(
  `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class cls ON cls.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'source_trust_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%event_type%';`
);
out.source_trust_events_check_pre = preChkRes.rows;

// Apply migration (single round trip; SQL contains its own BEGIN/COMMIT).
try {
  await client.query(migrationSql);
  out.apply_status = "OK";
} catch (e) {
  out.apply_status = "FAILED";
  out.error = e.message;
  await client.end();
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp/q5-apply-093-output.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// Post-apply: columns exist with expected shape.
const postColRes = await client.query(
  `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sources'
      AND column_name IN ('tier_override', 'override_reason', 'override_date')
    ORDER BY column_name;`
);
out.sources_override_columns_post = postColRes.rows;

// Post-apply: CHECK on tier_override (BETWEEN 1 AND 7 or NULL).
const postRangeRes = await client.query(
  `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class cls ON cls.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'sources'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%tier_override%';`
);
out.sources_tier_override_check_post = postRangeRes.rows;

// Post-apply: source_trust_events.event_type CHECK now includes the new values.
const postChkRes = await client.query(
  `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class cls ON cls.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'source_trust_events'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%event_type%';`
);
out.source_trust_events_check_post = postChkRes.rows;

const checkIncludesOverride = postChkRes.rows.some(
  (r) => r.def.includes("'tier_override'") && r.def.includes("'tier_override_revert'")
);
out.check_includes_override_events = checkIncludesOverride;
if (!checkIncludesOverride) {
  out.apply_status = "FAILED";
  out.error = "Post-apply CHECK does not include tier_override + tier_override_revert";
  await client.end();
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp/q5-apply-093-output.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// Smoke test: confirm a synthetic INSERT with event_type='tier_override' would
// be admitted (rolled back). Skip if no sources rows exist (test DB).
const sampleSrcRes = await client.query(`SELECT id FROM public.sources LIMIT 1;`);
if (sampleSrcRes.rows.length > 0) {
  const sampleId = sampleSrcRes.rows[0].id;
  await client.query("BEGIN;");
  try {
    await client.query(
      `INSERT INTO public.source_trust_events (source_id, event_type, details, created_by)
       VALUES ($1, 'tier_override', '{"smoke": true}'::jsonb, 'human');`,
      [sampleId]
    );
    await client.query(
      `INSERT INTO public.source_trust_events (source_id, event_type, details, created_by)
       VALUES ($1, 'tier_override_revert', '{"smoke": true}'::jsonb, 'human');`,
      [sampleId]
    );
    out.smoke_insert_status = "OK";
  } catch (e) {
    out.smoke_insert_status = "FAILED";
    out.smoke_insert_error = e.message;
  } finally {
    await client.query("ROLLBACK;");
  }
}

// Ledger backfill: confirm 093 row exists post-apply; insert if not.
const ledgerCheckRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version IN ('088', '089', '090', '091', '092', '093')
    ORDER BY version;`
);
out.ledger_state_pre_backfill = ledgerCheckRes.rows;

const has093 = ledgerCheckRes.rows.some((r) => r.version === "093");
if (!has093) {
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations
       (version, name, statements)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (version) DO NOTHING;`,
    ["093", "sources_tier_override", migrationSql]
  );
  out.ledger_backfill_inserted = true;
} else {
  out.ledger_backfill_inserted = false;
}

const ledgerPostRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version = '093';`
);
out.ledger_state_post = ledgerPostRes.rows;

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/q5-apply-093-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
