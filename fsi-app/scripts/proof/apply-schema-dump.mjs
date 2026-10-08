#!/usr/bin/env node
// apply-schema-dump.mjs -- apply the schema-only dump of production to the LOCAL stack (lane PROOF-1,
// coordinator ruling 2026-10-07). The result is the chain proof's schema.
//
// The dump comes from dump-production-schema.mjs (supabase db dump, schema only, Supabase-managed schemas excluded
// by the CLI). This wrapper:
//   1. refuses any database URL that is not loopback (exit 2), before reading the dump;
//   2. drops ownership statements (ALTER ... OWNER TO ...;), because the roles that owned objects in production do
//      not exist locally and roles are excluded from the dump by ruling;
//   3. runs psql with ON_ERROR_STOP off, so one failed statement does not hide the rest, and collects every
//      ERROR line;
//   4. classifies the errors: a "role ... does not exist" error (a GRANT or default privilege naming a role that is
//      cluster-level and excluded) is counted as a role error and is NOT fatal; every other error is fatal;
//   5. writes schema-apply-report.json (counts and error messages, schema names only, never row data) and reads back
//      the number of public tables.
// Exit: 0 = no fatal error; 1 = at least one fatal error (the report lists them); 2 = cannot run.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const MAX_ERRORS_LISTED = 60;
const MAX_TEXT = 300;

/** Drop single-statement ownership lines. PURE. Returns { text, dropped }. */
export function stripOwnership(text) {
  let dropped = 0;
  const kept = String(text ?? "").split(/\r?\n/).filter((l) => {
    if (/^ALTER .* OWNER TO .*;\s*$/.test(l)) { dropped++; return false; }
    return true;
  });
  return { text: kept.join("\n"), dropped };
}

/** Collect every ERROR line from psql stderr. PURE. */
export function collectErrors(stderr) {
  const out = [];
  for (const line of String(stderr ?? "").split(/\r?\n/)) {
    const m = /^psql:.*?:(\d+):\s*ERROR:\s*(.*)$/.exec(line);
    if (m) out.push({ line: Number(m[1]), message: m[2].slice(0, MAX_TEXT) });
  }
  return out;
}

const ROLE_ERROR_RE = /^role ".*" does not exist/;

/** Split errors into fatal and role errors. PURE. */
export function classifyErrors(errors) {
  return { fatal: errors.filter((e) => !ROLE_ERROR_RE.test(e.message)), role: errors.filter((e) => ROLE_ERROR_RE.test(e.message)) };
}

/** Build the report. PURE. */
export function buildReport({ errors, dropped, publicTables, startedAt, finishedAt }) {
  const { fatal, role } = classifyErrors(errors);
  return {
    schema: "chain-proof-schema-apply-report/1",
    started_at: startedAt,
    finished_at: finishedAt,
    ownership_statements_dropped: dropped,
    fatal_errors: fatal.length,
    role_errors: role.length,
    public_tables: publicTables,
    errors: fatal.slice(0, MAX_ERRORS_LISTED),
    ok: fatal.length === 0 && (publicTables ?? 0) > 0,
  };
}

/** Apply the dump. Everything external is injected. Returns the report. */
export function applySchemaDump({ dbUrl, dumpPath, workDir, psql = "psql", spawn = spawnSync, read = readFileSync, write = writeFileSync, now = () => new Date() }) {
  assertLoopbackDbUrl(dbUrl);
  const startedAt = now().toISOString();
  const { text, dropped } = stripOwnership(read(dumpPath, "utf8"));
  const sanitized = join(workDir, "schema-dump.sanitized.sql");
  write(sanitized, text, "utf8");
  const run = spawn(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=0", "-f", sanitized], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  const errors = collectErrors(run.stderr);
  if (run.error) errors.push({ line: 0, message: `could not run ${psql}: ${run.error.message}`.slice(0, MAX_TEXT) });
  const probe = spawn(psql, [dbUrl, "-X", "-At", "-c", "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  const n = Number.parseInt(String(probe.stdout ?? "").trim(), 10);
  return buildReport({ errors, dropped, publicTables: Number.isFinite(n) ? n : null, startedAt, finishedAt: now().toISOString() });
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const dumpPath = arg("--in");
  const reportPath = arg("--report");
  const dbUrl = arg("--db-url") || process.env.PROOF_DB_URL || process.env.SUPABASE_DB_URL;
  if (!dumpPath || !reportPath) { console.error("apply-schema-dump: --in <dump.sql> and --report <path> are required"); process.exit(2); }
  if (!dbUrl) { console.error("apply-schema-dump: no database URL (--db-url, PROOF_DB_URL or SUPABASE_DB_URL)"); process.exit(2); }
  try { assertLoopbackDbUrl(dbUrl); } catch (e) { console.error(`apply-schema-dump: ${e.message}`); process.exit(2); }
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  const report = applySchemaDump({ dbUrl, dumpPath: resolve(dumpPath), workDir: dirname(resolve(dumpPath)) });
  writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`apply-schema-dump: ${report.ok ? "OK" : "FAILED"}; public tables ${report.public_tables}; fatal errors ${report.fatal_errors}; role errors ${report.role_errors}; ownership statements dropped ${report.ownership_statements_dropped}`);
  for (const e of report.errors.slice(0, 15)) console.error(`  line ${e.line}: ${e.message}`);
  process.exit(report.ok ? 0 : 1);
}
