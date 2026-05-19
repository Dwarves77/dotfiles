// Sprint 2 Build 1 — Stage 2 preflight verification
// Confirms ledger drift, recompute_agent_integrity_flag body, and absence of integrity_flags table.
// Reads creds from main repo C:/Users/jason/dotfiles/fsi-app/.env.local + supabase/.temp/

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_REPO_FSI = "C:/Users/jason/dotfiles/fsi-app";
const WORKTREE_FSI = resolve(__dirname, "../..");

const DB_PASSWORD = readFileSync(`${MAIN_REPO_FSI}/.env.local`, "utf8")
  .match(/^SUPABASE_DB_PASSWORD=(.*)$/m)?.[1]?.trim();
const POOLER_URL = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/pooler-url`, "utf8").trim();
const PROJECT_REF = readFileSync(`${MAIN_REPO_FSI}/supabase/.temp/project-ref`, "utf8").trim();
const connectionString = POOLER_URL.replace(
  `postgres.${PROJECT_REF}@`,
  `postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@`
);

const client = new pg.Client({ connectionString });
await client.connect();

// 1. Ledger drift check
const expectedUnrecorded = [
  "026", "027", "028", "029", "030", "031", "032", "033", "034", "035",
  "036", "037", "038", "039", "040", "041", "042", "043", "044", "045",
  "046", "047", "048", "049", "050", "070", "078",
];
const ledgerRows = (
  await client.query(
    `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`
  )
).rows;
const ledgerVersions = new Set(ledgerRows.map((r) => r.version));
const stillUnrecorded = expectedUnrecorded.filter((v) => !ledgerVersions.has(v));
const unexpectedlyRecorded = expectedUnrecorded.filter((v) => ledgerVersions.has(v));

// 2. recompute_agent_integrity_flag body verification
const fnRows = (
  await client.query(
    `SELECT pg_get_functiondef(oid) AS body
     FROM pg_proc
     WHERE proname = 'recompute_agent_integrity_flag'
       AND pronamespace = 'public'::regnamespace`
  )
).rows;
const liveBody = fnRows[0]?.body ?? null;

const expectedPhrases044 = [
  "replace the source URL",
  "do not act on (any |the )?prior brief",
  "specific article, regulatory text, or guidance document",
  "unable to verify",
  "could not confirm",
];
const droppedPhrases035 = [
  "integrity rule",
  "should be there",
  "if .{1,40}? was intended",
];
const phraseAudit = {
  expected_5_present: expectedPhrases044.map((p) => ({
    phrase: p,
    present: liveBody ? liveBody.includes(p) : false,
  })),
  dropped_3_absent: droppedPhrases035.map((p) => ({
    phrase: p,
    absent: liveBody ? !liveBody.includes(p) : true,
  })),
};
const allFivePresent = phraseAudit.expected_5_present.every((r) => r.present);
const allThreeAbsent = phraseAudit.dropped_3_absent.every((r) => r.absent);
const bodyMatch = allFivePresent && allThreeAbsent;

// 3. integrity_flags absence + recurring_spot_check_log phantom
const tablesRows = (
  await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('integrity_flags', 'recurring_spot_check_log')`
  )
).rows;
const integrityFlagsAbsent = !tablesRows.some((r) => r.table_name === "integrity_flags");
const phantomAbsent = !tablesRows.some(
  (r) => r.table_name === "recurring_spot_check_log"
);

// 4. ledger row shape — query one existing row for shape reference
const sampleRow = (
  await client.query(
    `SELECT version, name, statements
     FROM supabase_migrations.schema_migrations
     ORDER BY version LIMIT 1`
  )
).rows[0];
const ledgerColumns = (
  await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'supabase_migrations'
       AND table_name = 'schema_migrations'
     ORDER BY ordinal_position`
  )
).rows;

await client.end();

const output = {
  generated_at: new Date().toISOString(),
  ledger: {
    total_recorded: ledgerRows.length,
    expected_unrecorded: expectedUnrecorded,
    still_unrecorded: stillUnrecorded,
    unexpectedly_recorded: unexpectedlyRecorded,
    drift_from_stage1: unexpectedlyRecorded.length > 0,
  },
  recompute_agent_integrity_flag: {
    function_exists: liveBody !== null,
    phrase_audit: phraseAudit,
    body_matches_044: bodyMatch,
    halt_required: !bodyMatch,
  },
  schema_sanity: {
    integrity_flags_absent: integrityFlagsAbsent,
    phantom_recurring_spot_check_log_absent: phantomAbsent,
    tables_found: tablesRows.map((r) => r.table_name),
  },
  ledger_shape: {
    columns: ledgerColumns,
    sample_row: {
      version: sampleRow?.version,
      name: sampleRow?.name,
      statements_type: Array.isArray(sampleRow?.statements)
        ? `array[${sampleRow.statements.length}]`
        : typeof sampleRow?.statements,
      statements_first_100: Array.isArray(sampleRow?.statements)
        ? sampleRow.statements[0]?.slice(0, 100)
        : String(sampleRow?.statements ?? "").slice(0, 100),
    },
  },
};

const outPath = resolve(__dirname, "stage2-preflight-output.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
console.log(`\nWrote ${outPath}`);
