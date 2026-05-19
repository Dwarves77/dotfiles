// Migration 088 apply: executes the migration SQL as a single client call,
// then writes a row to supabase_migrations.schema_migrations to match
// existing entries' format. Reports verification queries.
//
// Pattern per scripts/tmp/mig083-apply.mjs and per OBS-12.

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

const migrationPath = resolve(process.cwd(), "supabase/migrations/088_citation_stats_rpc.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({ connectionString });
await client.connect();

const out = {
  generated_at: new Date().toISOString(),
  migration_path: migrationPath,
};

// Pre-apply: confirm RPC does not already exist (or document if it does).
const preFnRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_source_citation_stats'
   ) AS exists;`
);
out.rpc_existed_pre_apply = preFnRes.rows[0].exists;

// Apply migration (single round trip; SQL contains its own BEGIN/COMMIT).
try {
  await client.query(migrationSql);
  out.apply_status = "OK";
} catch (e) {
  out.apply_status = "FAILED";
  out.error = e.message;
  await client.end();
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp/q8-apply-088-output.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// Post-apply: RPC exists, signature matches.
const postFnRes = await client.query(
  `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
          pg_get_function_result(p.oid) AS result_type
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_source_citation_stats';`
);
out.rpc_signature_post_apply = postFnRes.rows;

// Smoke test the RPC against the same 3 sample sources used in pre-flight.
const sampleIds = [
  "0768a0d2-4f2e-4b4f-a84e-05084c107f79",
  "fa6d6470-6b45-452a-9bc6-6fdff4ec44ae",
  "87894622-d165-4ca0-84dd-13c433058616",
];
const smokeRes = await client.query(
  `SELECT * FROM public.get_source_citation_stats($1::uuid[]);`,
  [sampleIds]
);
out.rpc_smoke_test = smokeRes.rows;

// Ledger backfill: confirm 088 row exists post-apply; insert if not.
const ledgerCheckRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version IN ('085', '086', '087', '088')
    ORDER BY version;`
);
out.ledger_state_pre_backfill = ledgerCheckRes.rows;

const has088 = ledgerCheckRes.rows.some((r) => r.version === "088");
if (!has088) {
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations
       (version, name, statements)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (version) DO NOTHING;`,
    ["088", "citation_stats_rpc", migrationSql]
  );
  out.ledger_backfill_inserted = true;
} else {
  out.ledger_backfill_inserted = false;
}

const ledgerPostRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version = '088';`
);
out.ledger_state_post = ledgerPostRes.rows;

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/q8-apply-088-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
