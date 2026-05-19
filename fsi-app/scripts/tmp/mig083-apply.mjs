// Migration 083 apply: executes the migration SQL as a single client call,
// then writes a row to supabase_migrations.schema_migrations to match
// existing entries' format. Reports backfill rowcount.
//
// DB connection pattern per OBS-12.

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

const migrationPath = resolve(process.cwd(), "supabase/migrations/083_trigger_derive_jurisdiction_iso.sql");
const migrationSql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({ connectionString });
await client.connect();

const out = {
  generated_at: new Date().toISOString(),
  migration_path: migrationPath
};

// Pre-apply: confirm helper does not already exist.
const preFnRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_derive_jurisdiction_iso_from_canonical'
   ) AS exists;`
);
out.helper_existed_pre_apply = preFnRes.rows[0].exists;

// Apply migration (single round trip; SQL contains its own BEGIN/COMMIT).
try {
  await client.query(migrationSql);
  out.apply_status = "OK";
} catch (e) {
  out.apply_status = "FAILED";
  out.error = e.message;
  await client.end();
  writeFileSync(
    resolve(process.cwd(), "scripts/tmp/mig083-apply-output.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

// Post-apply verification: helper exists, trigger body has derive line.
const postFnRes = await client.query(
  `SELECT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_derive_jurisdiction_iso_from_canonical'
   ) AS exists;`
);
out.helper_exists_post_apply = postFnRes.rows[0].exists;

const trigBodyRes = await client.query(
  `SELECT pg_get_functiondef(p.oid) AS body
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_intelligence_items_normalize_jurisdictions';`
);
const body = trigBodyRes.rows[0]?.body || "";
out.trigger_body_has_derive_step = body.includes("_derive_jurisdiction_iso_from_canonical");

// Ledger backfill: confirm 083 row exists post-apply. If the migration's
// BEGIN/COMMIT block did not write to supabase_migrations (it does not),
// we INSERT it here to match the format the operator's CLI uses.
const ledgerCheckRes = await client.query(
  `SELECT version, name, statements IS NOT NULL AS has_stmts
     FROM supabase_migrations.schema_migrations
    WHERE version IN ('081', '082', '083')
    ORDER BY version;`
);
out.ledger_state_pre_backfill = ledgerCheckRes.rows;

// Inspect 082's row shape to mirror format.
const fmtRes = await client.query(
  `SELECT version, name,
          (statements IS NULL) AS stmts_null,
          coalesce(array_length(statements, 1), 0) AS stmts_len,
          name
     FROM supabase_migrations.schema_migrations
    WHERE version = '082';`
);
out.row_082_shape = fmtRes.rows[0] || null;

const has083 = ledgerCheckRes.rows.some((r) => r.version === "083");
if (!has083) {
  // Match 082's format (per row_082_shape inspection above). The
  // Supabase CLI typically stores: version (text), name (text), statements
  // (text[]). We pass the full migration SQL as a single-element array.
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations
       (version, name, statements)
     VALUES ($1, $2, ARRAY[$3]::text[])
     ON CONFLICT (version) DO NOTHING;`,
    ["083", "trigger_derive_jurisdiction_iso", migrationSql]
  );
  out.ledger_backfill_inserted = true;
} else {
  out.ledger_backfill_inserted = false;
}

const ledgerPostRes = await client.query(
  `SELECT version, name
     FROM supabase_migrations.schema_migrations
    WHERE version = '083';`
);
out.ledger_state_post = ledgerPostRes.rows;

await client.end();

writeFileSync(
  resolve(process.cwd(), "scripts/tmp/mig083-apply-output.json"),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
