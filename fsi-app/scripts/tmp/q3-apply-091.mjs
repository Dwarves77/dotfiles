// Q3 migration 091 apply: creates public.source_tier_opinions table,
// indexes, and the public.get_tier_opinion_disagreements function. Then
// runs a smoke test against the function with empty data (expects empty
// result set), and backfills the supabase_migrations.schema_migrations
// ledger row to match the existing format.
//
// DB connection pattern per OBS-12 / mig083-apply precedent. Reads
// .env.local and supabase/.temp/* from the operator's primary
// fsi-app dir (this worktree was created without those local files
// because Supabase CLI link is per-checkout, not per-worktree).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const PRIMARY_FSI = "C:/Users/jason/dotfiles/fsi-app";

const DB_PASSWORD = readFileSync(resolve(PRIMARY_FSI, ".env.local"), "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(resolve(PRIMARY_FSI, "supabase/.temp/pooler-url"), "utf8").trim();
const PROJECT_REF = readFileSync(resolve(PRIMARY_FSI, "supabase/.temp/project-ref"), "utf8").trim();
if (!DB_PASSWORD || !POOLER_URL || !PROJECT_REF) {
  console.error("Missing DB credentials. Halting.");
  process.exit(2);
}
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

// Absolute path so the script can be run from any cwd (the worktree
// has no node_modules; we run from the primary fsi-app dir which has pg).
const WORKTREE_FSI = "C:/Users/jason/dotfiles-wt-q3-tier-opinions/fsi-app";
const migrationPath = resolve(WORKTREE_FSI, "supabase/migrations/091_source_tier_opinions.sql");
const outputPath = resolve(WORKTREE_FSI, "scripts/tmp/q3-apply-091-output.json");
const migrationSql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({ connectionString });
await client.connect();

const out = {
  generated_at: new Date().toISOString(),
  migration_path: migrationPath
};

// ── Pre-apply checks ──
const preTableRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_catalog.pg_tables
     WHERE schemaname = 'public' AND tablename = 'source_tier_opinions'
   ) AS exists;`
);
out.table_existed_pre_apply = preTableRes.rows[0].exists;

const preFnRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_tier_opinion_disagreements'
   ) AS exists;`
);
out.function_existed_pre_apply = preFnRes.rows[0].exists;

// ── Apply migration ──
try {
  await client.query(migrationSql);
  out.apply_status = "OK";
} catch (e) {
  out.apply_status = "FAILED";
  out.error = e.message;
  await client.end();
  writeFileSync(
    outputPath,
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// ── Post-apply verification ──
const postTableRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_catalog.pg_tables
     WHERE schemaname = 'public' AND tablename = 'source_tier_opinions'
   ) AS exists;`
);
out.table_exists_post_apply = postTableRes.rows[0].exists;

const colRes = await client.query(
  `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'source_tier_opinions'
    ORDER BY ordinal_position;`
);
out.columns = colRes.rows;

const idxRes = await client.query(
  `SELECT indexname, indexdef
     FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public' AND tablename = 'source_tier_opinions'
    ORDER BY indexname;`
);
out.indexes = idxRes.rows;

const checkRes = await client.query(
  `SELECT conname, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relname = 'source_tier_opinions'
    ORDER BY conname;`
);
out.constraints = checkRes.rows;

const postFnRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_tier_opinion_disagreements'
   ) AS exists;`
);
out.function_exists_post_apply = postFnRes.rows[0].exists;

const fnSigRes = await client.query(
  `SELECT pg_get_function_identity_arguments(p.oid) AS args,
          pg_get_function_result(p.oid) AS result
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_tier_opinion_disagreements';`
);
out.function_signature = fnSigRes.rows[0] || null;

// ── Smoke test: call the function with empty data, default window ──
const smokeDefaultRes = await client.query(
  `SELECT * FROM public.get_tier_opinion_disagreements();`
);
out.smoke_default_window_row_count = smokeDefaultRes.rowCount;
out.smoke_default_window_rows = smokeDefaultRes.rows;

const smokeCustomRes = await client.query(
  `SELECT * FROM public.get_tier_opinion_disagreements(30);`
);
out.smoke_custom_window_row_count = smokeCustomRes.rowCount;

// ── Comment verification ──
const commentRes = await client.query(
  `SELECT obj_description('public.source_tier_opinions'::regclass, 'pg_class') AS table_comment;`
);
out.table_comment_present = !!commentRes.rows[0].table_comment;

// ── Ledger backfill ──
const ledgerCheckRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version IN ('088', '089', '090', '091')
    ORDER BY version;`
);
out.ledger_state_pre_backfill = ledgerCheckRes.rows;

const has091 = ledgerCheckRes.rows.some((r) => r.version === "091");
if (!has091) {
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations
       (version, name, statements)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (version) DO NOTHING;`,
    ["091", "source_tier_opinions", migrationSql]
  );
  out.ledger_backfill_inserted = true;
} else {
  out.ledger_backfill_inserted = false;
}

const ledgerPostRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version = '091';`
);
out.ledger_state_post = ledgerPostRes.rows;

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/q3-apply-091-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
