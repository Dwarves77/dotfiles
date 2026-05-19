// Sprint 2 Build 1 — Stage 2 apply
// Applies migrations 048, 049, 050 to live DB and backfills ledger 026-050.
// HYBRID strategy per Sprint 2 plan: out-of-band migrations recorded without
// re-running their statements; truly-unapplied migrations (048, 049, 050)
// applied THEN recorded.
//
// Per Sprint 2 plan + Stage 1 discovery 2026-05-18.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_REPO_FSI = "C:/Users/jason/dotfiles/fsi-app";
const WORKTREE_FSI = resolve(__dirname, "../..");
const MIGRATIONS_DIR = `${WORKTREE_FSI}/supabase/migrations`;

const DB_PASSWORD = readFileSync(`${MAIN_REPO_FSI}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

// Resolve migration file paths by version prefix
function findMigrationFile(version) {
  const all = readdirSync(MIGRATIONS_DIR);
  const match = all.find((f) => f.startsWith(`${version}_`) && f.endsWith(".sql"));
  if (!match) return null;
  return `${MIGRATIONS_DIR}/${match}`;
}

// Split a SQL file into individual statements (basic splitter — splits on
// semicolons that terminate top-level statements; ignores semicolons inside
// dollar-quoted blocks $$ ... $$).
function splitStatements(sql) {
  const stmts = [];
  let buf = "";
  let inDollar = false;
  let dollarTag = "";
  let i = 0;
  while (i < sql.length) {
    if (!inDollar) {
      // detect dollar-quote opening
      const m = sql.slice(i).match(/^\$([A-Za-z_]*)\$/);
      if (m) {
        inDollar = true;
        dollarTag = `$${m[1]}$`;
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
      if (sql[i] === ";") {
        const trimmed = buf.trim();
        if (trimmed) stmts.push(trimmed);
        buf = "";
        i++;
        continue;
      }
      buf += sql[i];
      i++;
    } else {
      // looking for closing dollar tag
      if (sql.slice(i, i + dollarTag.length) === dollarTag) {
        buf += dollarTag;
        i += dollarTag.length;
        inDollar = false;
        dollarTag = "";
        continue;
      }
      buf += sql[i];
      i++;
    }
  }
  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

// Migrations to backfill (all 25 — 026-050 inclusive)
const BACKFILL_VERSIONS = [
  "026", "027", "028", "029", "030", "031", "032", "033", "034", "035",
  "036", "037", "038", "039", "040", "041", "042", "043", "044", "045",
  "046", "047", "048", "049", "050",
];

// Migrations to APPLY (then backfill happens for these as part of the same set)
const APPLY_VERSIONS = ["048", "049", "050"];

const client = new pg.Client({ connectionString });
await client.connect();

const log = {
  generated_at: new Date().toISOString(),
  steps: [],
  errors: [],
};

function step(name, payload) {
  console.log(`[step] ${name}`);
  log.steps.push({ name, ...payload });
}

try {
  await client.query("BEGIN");

  // ── 1. Apply 048 ────────────────────────────────────────────────
  {
    const file = findMigrationFile("048");
    const sql = readFileSync(file, "utf8");
    await client.query(sql);
    step("apply_048", { file, bytes: sql.length });
  }
  // Verify 048
  const tab048 = (
    await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='integrity_flags'`
    )
  ).rows;
  const idx048 = (
    await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='integrity_flags' ORDER BY indexname`
    )
  ).rows;
  const pol048 = (
    await client.query(
      `SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='integrity_flags' ORDER BY policyname`
    )
  ).rows;
  step("verify_048", {
    table_present: tab048.length === 1,
    indexes: idx048.map((r) => r.indexname),
    policies: pol048.map((r) => r.policyname),
  });

  // ── 2. Apply 049 ────────────────────────────────────────────────
  {
    const file = findMigrationFile("049");
    const sql = readFileSync(file, "utf8");
    await client.query(sql);
    step("apply_049", { file, bytes: sql.length });
  }
  const idx049 = (
    await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public'
         AND indexname IN ('idx_item_supersessions_old','idx_item_supersessions_new','idx_intel_items_added_date_desc')
       ORDER BY indexname`
    )
  ).rows;
  step("verify_049", { indexes: idx049.map((r) => r.indexname) });

  // ── 3. Apply 050 ────────────────────────────────────────────────
  {
    const file = findMigrationFile("050");
    const sql = readFileSync(file, "utf8");
    await client.query(sql);
    step("apply_050", { file, bytes: sql.length });
  }
  const check050 = (
    await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
       WHERE conname='integrity_flags_category_check'`
    )
  ).rows;
  const widenedOk = check050[0]?.def?.includes("workflow_gap") ?? false;
  step("verify_050", {
    constraint_def: check050[0]?.def,
    widened_to_workflow_gap: widenedOk,
  });

  // ── 4. Backfill ledger for all 25 versions ──────────────────────
  const backfillResults = [];
  for (const version of BACKFILL_VERSIONS) {
    const file = findMigrationFile(version);
    if (!file) {
      backfillResults.push({ version, status: "FILE_MISSING" });
      continue;
    }
    const sql = readFileSync(file, "utf8");
    // Migration name = filename without leading version_ prefix and .sql
    const filenameParts = file.split("/").pop().replace(/\.sql$/, "");
    const nameOnly = filenameParts.replace(/^\d{3}_/, "");
    // Statements: text[] array per the sample row shape.
    const statements = splitStatements(sql);
    const insertSql = `
      INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
      VALUES ($1, $2, $3)
      ON CONFLICT (version) DO NOTHING
      RETURNING version
    `;
    const res = await client.query(insertSql, [version, nameOnly, statements]);
    backfillResults.push({
      version,
      name: nameOnly,
      statement_count: statements.length,
      inserted: res.rowCount === 1,
    });
  }
  step("backfill_ledger", { results: backfillResults });

  // ── 5. Verify ledger now contains all 25 ────────────────────────
  const finalLedger = (
    await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations
       WHERE version = ANY($1::text[])
       ORDER BY version`,
      [BACKFILL_VERSIONS]
    )
  ).rows;
  step("verify_ledger", {
    expected_count: BACKFILL_VERSIONS.length,
    actual_count: finalLedger.length,
    rows: finalLedger,
  });

  if (finalLedger.length !== BACKFILL_VERSIONS.length) {
    throw new Error(
      `Ledger verification failed — expected ${BACKFILL_VERSIONS.length}, got ${finalLedger.length}`
    );
  }

  await client.query("COMMIT");
  log.committed = true;
  console.log("COMMITTED");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  log.committed = false;
  log.errors.push({ message: err.message, stack: err.stack });
  console.error("ROLLED BACK:", err.message);
  throw err;
} finally {
  const outPath = resolve(__dirname, "stage2-apply-output.json");
  writeFileSync(outPath, JSON.stringify(log, null, 2));
  console.log(`Wrote ${outPath}`);
  await client.end();
}
