/**
 * wave1-precheck.mjs — Wave 1a precheck (read-only).
 *
 * Purpose: surface drift between the migration ledger (canonical source of
 * schema in repo) and the live Supabase database before any Wave 1a ALTER
 * lands. Specifically resolves the sources.last_scanned mismatch surfaced
 * in the gate 1 audit (column referenced in code, not defined in any
 * migration .sql under supabase/migrations/).
 *
 * Scope: full column-level drift report for both target tables, not just
 * last_scanned. Output is durable in scripts/ for re-run on future schema
 * questions.
 *
 * Output: docs/wave1-precheck-2026-05-08.json
 *
 * Targets: sources, intelligence_items
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const TARGETS = ["sources", "intelligence_items"];

// ─── Live DB column introspection ────────────────────────────────────────
// PostgREST does not expose information_schema by default. Sample a single
// row and use Object.keys — PostgREST returns all columns including NULL
// values, so the key set is the full column list. Both target tables are
// populated (73 sources, 184 intelligence_items per gate 1 audit), so the
// sample-row approach is reliable here.
async function liveColumns(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) return { error: error.message, columns: null };
  if (!data || data.length === 0) {
    return { error: "table empty — cannot introspect via sample row", columns: null };
  }
  return { error: null, columns: Object.keys(data[0]).sort() };
}

// ─── Migration ledger parsing ────────────────────────────────────────────
// Two patterns:
//   1. CREATE TABLE [IF NOT EXISTS] <table> (<body>);
//      Body split top-level by commas (depth-aware to skip nested parens
//      in CHECK / DEFAULT clauses). Constraint clauses filtered out.
//   2. ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <name> ...

const CONSTRAINT_KEYWORDS = new Set([
  "PRIMARY",
  "FOREIGN",
  "CONSTRAINT",
  "UNIQUE",
  "CHECK",
  "EXCLUDE",
]);

function splitTopLevel(body) {
  const items = [];
  let depth = 0;
  let buf = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (buf.trim()) items.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) items.push(buf.trim());
  return items;
}

function parseMigrations(table) {
  const migDir = resolve("supabase", "migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const cols = new Map(); // col name → first-defining file

  function record(col, file) {
    const c = col.toLowerCase();
    if (!cols.has(c)) cols.set(c, file);
  }

  for (const file of files) {
    const sql = readFileSync(resolve(migDir, file), "utf8");

    // ── CREATE TABLE ──
    const createRe = new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
      "gi"
    );
    let cm;
    while ((cm = createRe.exec(sql)) !== null) {
      const items = splitTopLevel(cm[1]);
      for (const item of items) {
        // Strip leading line comments
        const stripped = item
          .split("\n")
          .filter((l) => !l.trim().startsWith("--"))
          .join("\n")
          .trim();
        if (!stripped) continue;
        // First word — is it a constraint or a column?
        const firstWord = (stripped.match(/^"?([A-Za-z_][A-Za-z_0-9]*)"?/) || [])[1];
        if (!firstWord) continue;
        if (CONSTRAINT_KEYWORDS.has(firstWord.toUpperCase())) continue;
        record(firstWord, file);
      }
    }

    // ── ALTER TABLE — capture full body until `;` then scan for ADD/DROP COLUMN
    // Necessary because Postgres allows multiple comma-separated ADD/DROP
    // COLUMN clauses in a single ALTER TABLE (used in migrations 007, 035,
    // 020). Per-clause regex misses everything after the first comma.
    const alterBodyRe = new RegExp(
      `ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
      "gi"
    );
    let abm;
    while ((abm = alterBodyRe.exec(sql)) !== null) {
      const body = abm[1];
      const addRe =
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z_0-9]*)"?/gi;
      let am;
      while ((am = addRe.exec(body)) !== null) record(am[1], file);

      const dropRe =
        /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z_0-9]*)"?/gi;
      let dm;
      while ((dm = dropRe.exec(body)) !== null) {
        cols.delete(dm[1].toLowerCase());
      }
    }
  }

  return {
    columns: [...cols.keys()].sort(),
    provenance: Object.fromEntries(cols),
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────
const report = {
  generated_at: new Date().toISOString(),
  targets: {},
  summary: {
    drift_detected: false,
    columns_on_live_not_in_migrations: 0,
    columns_in_migrations_not_on_live: 0,
  },
};

for (const table of TARGETS) {
  console.log(`\n── ${table} ──`);
  const live = await liveColumns(table);
  const ledger = parseMigrations(table);

  if (live.error) {
    console.log(`  Live DB error: ${live.error}`);
    report.targets[table] = { error: live.error, ledger };
    continue;
  }

  const liveSet = new Set(live.columns);
  const ledgerSet = new Set(ledger.columns);

  const onlyOnLive = live.columns.filter((c) => !ledgerSet.has(c));
  const onlyInLedger = ledger.columns.filter((c) => !liveSet.has(c));

  console.log(`  Live columns: ${live.columns.length}`);
  console.log(`  Migration ledger columns: ${ledger.columns.length}`);
  if (onlyOnLive.length > 0) {
    console.log(`  ⚠ On live DB but NOT in migration ledger (${onlyOnLive.length}):`);
    for (const c of onlyOnLive) console.log(`     - ${c}`);
    report.summary.columns_on_live_not_in_migrations += onlyOnLive.length;
    report.summary.drift_detected = true;
  } else {
    console.log(`  ✓ All live columns present in migration ledger`);
  }
  if (onlyInLedger.length > 0) {
    console.log(`  ⚠ In migration ledger but NOT on live DB (${onlyInLedger.length}):`);
    for (const c of onlyInLedger) {
      console.log(`     - ${c}  (defined in ${ledger.provenance[c]})`);
    }
    report.summary.columns_in_migrations_not_on_live += onlyInLedger.length;
    report.summary.drift_detected = true;
  } else {
    console.log(`  ✓ All migration-defined columns present on live DB`);
  }

  report.targets[table] = {
    live_columns: live.columns,
    live_count: live.columns.length,
    ledger_columns: ledger.columns,
    ledger_count: ledger.columns.length,
    only_on_live: onlyOnLive,
    only_in_ledger: onlyInLedger.map((c) => ({
      column: c,
      defined_in: ledger.provenance[c],
    })),
  };
}

// ─── last_scanned resolution (specific to dispatch precondition) ─────────
const sourcesTarget = report.targets.sources;
const lastScannedOnLive =
  sourcesTarget?.live_columns?.includes("last_scanned") ?? false;
const lastScannedInLedger =
  sourcesTarget?.ledger_columns?.includes("last_scanned") ?? false;

report.last_scanned_resolution = {
  exists_on_live: lastScannedOnLive,
  defined_in_migrations: lastScannedInLedger,
  defined_in: lastScannedInLedger
    ? sourcesTarget.only_in_ledger.find((x) => x.column === "last_scanned")?.defined_in ??
      "(in migration ledger AND on live)"
    : null,
  conclusion:
    lastScannedOnLive && !lastScannedInLedger
      ? "OUT-OF-BAND-ALTER: column exists on live DB but is not codified in any migration. Wave 1a should add an idempotent `ADD COLUMN IF NOT EXISTS last_scanned TIMESTAMPTZ` migration to retroactively codify."
      : lastScannedOnLive && lastScannedInLedger
        ? "OK: column exists on live DB AND is codified in migration ledger. No action needed."
        : !lastScannedOnLive && lastScannedInLedger
          ? "MIGRATION-NOT-APPLIED: column is in migration ledger but NOT on live DB. Apply pending migration before Wave 1a."
          : "MISSING-ENTIRELY: column referenced in agent/run/route.ts:39,374 but neither on live DB nor in migration ledger. Code references are silently failing. Wave 1a must add column AND verify worker behavior was correct.",
};

console.log(`\n── last_scanned resolution ──`);
console.log(`  on_live: ${report.last_scanned_resolution.exists_on_live}`);
console.log(`  in_ledger: ${report.last_scanned_resolution.defined_in_migrations}`);
console.log(`  conclusion: ${report.last_scanned_resolution.conclusion}`);

// ─── Write artifact ──────────────────────────────────────────────────────
const outPath = resolve("..", "docs", "wave1-precheck-2026-05-08.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\n✓ Precheck complete. Output: docs/wave1-precheck-2026-05-08.json`);
console.log(`  Drift detected: ${report.summary.drift_detected}`);
console.log(
  `  Live columns w/o migration: ${report.summary.columns_on_live_not_in_migrations}`
);
console.log(
  `  Migration columns w/o live: ${report.summary.columns_in_migrations_not_on_live}`
);
