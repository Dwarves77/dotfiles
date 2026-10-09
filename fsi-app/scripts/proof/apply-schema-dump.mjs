#!/usr/bin/env node
// apply-schema-dump.mjs -- apply the schema-only dump of production to the ORACLE cluster (lane PROOF-1, rewritten by
// lane PROOF-6, 2026-10-09, coordinator ruling 2026-10-09).
//
// The oracle cluster is the second container create-oracle-db.mjs starts (same image as the stack, distinct port,
// database `postgres`). The dump is applied there AS WRITTEN, as the superuser `supabase_admin`, with
// `psql -v ON_ERROR_STOP=1`, so the first error fails the step:
//   - nothing is stripped: ALTER ... OWNER TO lines apply (the image creates postgres, anon, authenticated,
//     service_role and supabase_admin);
//   - nothing is classified non-fatal: a role the dump names that the image does not have ("role ... does not exist")
//     is a red step AND a line in the report (`missing_roles`), never a strip and never a tolerated error;
//   - a psql that exits non-zero without printing an ERROR line (a refused connection, a missing file) is red too.
// PROOF-7 (2026-10-09): pg_dump's schema dump omits roles, so fire 6 failed on exactly one error, role "reconciler" does
// not exist. With --roles <file> (the filtered roles file dump-roles.mjs writes: role names and attributes, never
// passwords) the wrapper applies that file FIRST, as the same supabase_admin with the same ON_ERROR_STOP=1 and the same
// URL assertions; an error there is red (`roles_errors`) and the dump is not applied. The missing_roles check below stays
// as the attack: a dump naming a role absent from the roles file is still red and names the role.
// This wrapper:
//   1. refuses (exit 2) any URL that is not loopback, not the supabase_admin role, not database `postgres`, or on the
//      same port as the stack's own database (PROOF_DB_URL, the replayed schema): the dump never lands on the replay;
//   2. runs psql on the dump file itself and collects the ERROR line(s);
//   3. writes schema-apply-report.json (counts, error messages and role names, never row data) and reads back the
//      number of public tables.
// Exit: 0 = applied with no error; 1 = an error (the report lists it); 2 = cannot run.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { SUPERUSER_ROLE } from "./write-local-env.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const MAX_ERRORS_LISTED = 60;
const MAX_TEXT = 300;

/** The psql arguments for the dump apply. PURE. ON_ERROR_STOP=1 is the contract: the first error stops the apply. */
export function psqlArgs(dbUrl, dumpPath) {
  return [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", dumpPath];
}

/** Refuse any URL that is not the oracle cluster's. PURE. Throws a message naming the rule, never the URL. */
export function assertOracleUrl(dbUrl, stackUrl) {
  assertLoopbackDbUrl(dbUrl);
  const u = new URL(dbUrl);
  if (u.username !== SUPERUSER_ROLE) throw new Error(`the oracle URL must name the ${SUPERUSER_ROLE} role`);
  if (u.pathname !== "/postgres") throw new Error("the oracle URL must name the database postgres");
  if (stackUrl) {
    const s = new URL(stackUrl);
    if (s.hostname === u.hostname && (s.port || "5432") === (u.port || "5432")) throw new Error("the oracle URL names the stack's own database; the dump is never applied to the replayed schema");
  }
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

/** The role name in a "role ... does not exist" error, else null. PURE. */
export function missingRole(message) {
  const m = /^role "(.*)" does not exist/.exec(String(message ?? ""));
  return m ? m[1] : null;
}

/** Build the report. PURE. Every error is fatal; a missing role is also named in `missing_roles`. */
export function buildReport({ errors, publicTables, startedAt, finishedAt, rolesApplied = false, rolesErrors = [] }) {
  const missing = [...new Set(errors.map((e) => missingRole(e.message)).filter(Boolean))];
  return {
    schema: "chain-proof-schema-apply-report/1",
    started_at: startedAt,
    finished_at: finishedAt,
    fatal_errors: errors.length + rolesErrors.length,
    roles_applied: rolesApplied,
    roles_errors: rolesErrors.length,
    role_errors: errors.filter((e) => missingRole(e.message)).length,
    missing_roles: missing,
    public_tables: publicTables,
    errors: [...rolesErrors.map((e) => ({ ...e, phase: "roles" })), ...errors].slice(0, MAX_ERRORS_LISTED),
    ok: errors.length === 0 && rolesErrors.length === 0 && (publicTables ?? 0) > 0,
  };
}

/** Run psql on one file and collect its errors (psql's ERROR lines, a failed launch, or a non-zero exit with no ERROR line). */
function applyFile({ dbUrl, filePath, psql, spawn }) {
  const run = spawn(psql, psqlArgs(dbUrl, filePath), { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  const errors = collectErrors(run.stderr);
  if (run.error) errors.push({ line: 0, message: `could not run ${psql}: ${run.error.message}`.slice(0, MAX_TEXT) });
  else if (run.status !== 0 && errors.length === 0) {
    const last = String(run.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0] ?? "";
    errors.push({ line: 0, message: `psql exited with status ${run.status}: ${last.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")}`.slice(0, MAX_TEXT) });
  }
  return errors;
}

/** Apply the roles file (when given) and then the dump. Everything external is injected. Returns the report. */
export function applySchemaDump({ dbUrl, stackUrl = null, dumpPath, rolesPath = null, psql = "psql", spawn = spawnSync, now = () => new Date() }) {
  assertOracleUrl(dbUrl, stackUrl);
  const startedAt = now().toISOString();
  let rolesErrors = [];
  if (rolesPath) {
    rolesErrors = applyFile({ dbUrl, filePath: rolesPath, psql, spawn });
    if (rolesErrors.length) return buildReport({ errors: [], publicTables: null, startedAt, finishedAt: now().toISOString(), rolesApplied: false, rolesErrors });
  }
  const errors = applyFile({ dbUrl, filePath: dumpPath, psql, spawn });
  const probe = spawn(psql, [dbUrl, "-X", "-At", "-c", "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  const n = Number.parseInt(String(probe.stdout ?? "").trim(), 10);
  return buildReport({ errors, publicTables: Number.isFinite(n) ? n : null, startedAt, finishedAt: now().toISOString(), rolesApplied: Boolean(rolesPath), rolesErrors });
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const dumpPath = arg("--in");
  const reportPath = arg("--report");
  const rolesPath = arg("--roles");
  const dbUrl = arg("--db-url") || process.env.PROOF_ORACLE_DB_URL;
  if (!dumpPath || !reportPath) { console.error("apply-schema-dump: --in <dump.sql> and --report <path> are required"); process.exit(2); }
  if (!dbUrl) { console.error("apply-schema-dump: no oracle database URL (--db-url or PROOF_ORACLE_DB_URL)"); process.exit(2); }
  const stackUrl = process.env.PROOF_DB_URL || null;
  try { assertOracleUrl(dbUrl, stackUrl); } catch (e) { console.error(`apply-schema-dump: ${e.message}`); process.exit(2); }
  mkdirSync(dirname(resolve(reportPath)), { recursive: true });
  const report = applySchemaDump({ dbUrl, stackUrl, dumpPath: resolve(dumpPath), rolesPath: rolesPath ? resolve(rolesPath) : null });
  writeFileSync(resolve(reportPath), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`apply-schema-dump: ${report.ok ? "OK" : "FAILED"}; public tables ${report.public_tables}; roles applied ${report.roles_applied}; roles errors ${report.roles_errors}; fatal errors ${report.fatal_errors}; role errors ${report.role_errors}; missing roles ${report.missing_roles.join(", ") || "none"}`);
  for (const e of report.errors.slice(0, 15)) console.error(`  line ${e.line}: ${e.message}`);
  process.exit(report.ok ? 0 : 1);
}
