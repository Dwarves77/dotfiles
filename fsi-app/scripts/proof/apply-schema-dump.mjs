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
// DRIFT-1b (2026-10-10): the oracle image carries DEFAULT PRIVILEGES (pg_default_acl) that grant anon, authenticated and
// service_role on every object created in public; pg_dump emits no REVOKE for a role absent from an object's ACL, so
// every object the dump creates picked up grants production does not have (342 grants in fire 9, DRIFT-1 session log).
// Rule: the oracle's default privileges in the schemas the migrations govern ('' and public) must equal what the dump
// declares; extension-internal entries (cron, pgsodium) are outside the migrations and are counted, never compared. So,
// after the roles file and BEFORE the dump, the wrapper reads the oracle's own pg_default_acl, REVOKEs every non-owner
// grantee entry catalog-wide (catalog-driven, never a hand list), applies the dump (whose own `ALTER DEFAULT PRIVILEGES`
// statements, emitted after the objects, then declare production's), and reads pg_default_acl back: an entry in the
// governed scope the dump never declared is red (`default_acl.extra`). DRIFT-2 (2026-10-11): chain proof fire 10 found 8
// extras, all created by an extension's own install script while the dump ran (cron, pgsodium_masks, pgsodium); pg_dump
// never emits those, so the comparison was red by construction. The report names the scope (`default_acl.scope`) and
// counts the oracle rows it excluded (`default_acl.out_of_scope`), so the exclusion is visible in every run.
// Exit: 0 = applied with no error; 1 = an error (the report lists it); 2 = cannot run.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
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

const DEFACL_TYPES = { r: "TABLES", S: "SEQUENCES", f: "FUNCTIONS", T: "TYPES", n: "SCHEMAS" };
const DEFACL_WORDS = { TABLES: "r", SEQUENCES: "S", FUNCTIONS: "f", ROUTINES: "f", TYPES: "T", SCHEMAS: "n" };
const SEP = "|";

/** The catalog read of the non-owner default-privilege entries: one row per (owner, schema or empty, object type, grantee or PUBLIC). */
export const DEFAULT_ACL_QUERY = [
  "select pg_get_userbyid(d.defaclrole), coalesce(n.nspname, ''), d.defaclobjtype::text,",
  "case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end",
  "from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) a",
  "where a.grantee <> d.defaclrole group by 1, 2, 3, 4 order by 1, 2, 3, 4",
].join(" ");

/** Parse the psql -At rows of DEFAULT_ACL_QUERY. PURE. Throws on a row that is not four fields or has an unknown object type. */
export function parseDefaultAclRows(stdout) {
  return String(stdout ?? "").split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => {
    const f = l.split(SEP);
    if (f.length !== 4 || !f[0] || !f[3] || !DEFACL_TYPES[f[2]]) throw new Error(`unreadable pg_default_acl row: ${l.slice(0, 80)}`);
    return { owner: f[0], schema: f[1], objtype: f[2], grantee: f[3] };
  });
}

const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;
const granteeSql = (g) => (g === "PUBLIC" ? "PUBLIC" : ident(g));

/** The REVOKE statements that empty the given entries. PURE. One statement per row; the oracle's catalog is the source. */
export function clearDefaultAclStatements(rows) {
  return rows.map((r) => `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(r.owner)}${r.schema ? ` IN SCHEMA ${ident(r.schema)}` : ""} REVOKE ALL ON ${DEFACL_TYPES[r.objtype]} FROM ${granteeSql(r.grantee)};`);
}

/** Split a comma list of grantees outside double quotes. */
function splitGrantees(list) {
  const out = []; let cur = ""; let q = false;
  for (const ch of list) {
    if (ch === '"') q = !q;
    if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((g) => g.trim()).filter(Boolean).map((g) => (g.startsWith('"') ? g.slice(1, -1).replace(/""/g, '"') : g.toUpperCase() === "PUBLIC" ? "PUBLIC" : g.toLowerCase()));
}

/** The non-owner default-privilege entries the dump DECLARES (the GRANT forms of its ALTER DEFAULT PRIVILEGES). PURE. */
export function parseDumpDefaultAcl(dumpText, defaultOwner = SUPERUSER_ROLE) {
  const out = []; const seen = new Set();
  const re = /^ALTER DEFAULT PRIVILEGES\s+(?:FOR\s+(?:ROLE|USER)\s+("(?:[^"]|"")+"|\w+)\s+)?(?:IN\s+SCHEMA\s+("(?:[^"]|"")+"|\w+)\s+)?GRANT\s+[^;]*?\s+ON\s+(TABLES|SEQUENCES|FUNCTIONS|ROUTINES|TYPES|SCHEMAS)\s+TO\s+([^;]*?)(?:\s+WITH\s+GRANT\s+OPTION)?;/gim;
  const unq = (v) => (v.startsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v.toLowerCase());
  for (const m of String(dumpText ?? "").matchAll(re)) {
    const owner = m[1] ? unq(m[1]) : defaultOwner;
    const schema = m[2] ? unq(m[2]) : "";
    for (const grantee of splitGrantees(m[4])) {
      if (grantee === owner) continue;
      const row = { owner, schema, objtype: DEFACL_WORDS[m[3].toUpperCase()], grantee };
      const key = aclKey(row);
      if (!seen.has(key)) { seen.add(key); out.push(row); }
    }
  }
  return out;
}

function aclKey(r) { return [r.owner, r.schema, r.objtype, r.grantee].join(SEP); }

/** The schemas the migrations govern: cluster-wide entries (empty schema) and public. */
export const DEFAULT_ACL_SCOPE = Object.freeze(["", "public"]);

/**
 * The oracle's entries the dump never declared (extra) and the dump's entries the oracle lacks (missing), compared only in
 * the schemas the migrations govern; `out_of_scope` counts the oracle rows excluded from the comparison. PURE.
 */
export function compareDefaultAcl(oracleRows, declaredRows, { schemas = DEFAULT_ACL_SCOPE } = {}) {
  const inScope = (r) => schemas.includes(r.schema);
  const governed = oracleRows.filter(inScope);
  const o = new Set(governed.map(aclKey)); const d = new Set(declaredRows.filter(inScope).map(aclKey));
  return { extra: [...o].filter((k) => !d.has(k)).sort(), missing: [...d].filter((k) => !o.has(k)).sort(), out_of_scope: oracleRows.length - governed.length };
}

/** Build the report. PURE. Every error is fatal; a missing role is also named in `missing_roles`; a default-privilege entry the dump never declared is fatal. */
export function buildReport({ errors, publicTables, startedAt, finishedAt, rolesApplied = false, rolesErrors = [], defaultAcl = null, defaultsErrors = [] }) {
  const missing = [...new Set(errors.map((e) => missingRole(e.message)).filter(Boolean))];
  const extra = defaultAcl?.extra ?? [];
  return {
    schema: "chain-proof-schema-apply-report/1",
    started_at: startedAt,
    finished_at: finishedAt,
    fatal_errors: errors.length + rolesErrors.length + defaultsErrors.length + extra.length,
    roles_applied: rolesApplied,
    roles_errors: rolesErrors.length,
    role_errors: errors.filter((e) => missingRole(e.message)).length,
    missing_roles: missing,
    default_acl: defaultAcl,
    public_tables: publicTables,
    errors: [
      ...rolesErrors.map((e) => ({ ...e, phase: "roles" })),
      ...defaultsErrors.map((e) => ({ ...e, phase: "default-privileges" })),
      ...errors,
      ...extra.map((k) => ({ line: 0, message: `default privilege entry the dump never declared: ${k}`, phase: "default-privileges" })),
    ].slice(0, MAX_ERRORS_LISTED),
    ok: errors.length === 0 && rolesErrors.length === 0 && defaultsErrors.length === 0 && extra.length === 0 && (publicTables ?? 0) > 0,
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

/** Read the oracle's non-owner default-privilege entries through psql. Returns { rows, errors }. */
function readDefaultAcl({ dbUrl, psql, spawn }) {
  const run = spawn(psql, [dbUrl, "-X", "-At", "-F", SEP, "-c", DEFAULT_ACL_QUERY], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (run.error || run.status !== 0) return { rows: [], errors: [{ line: 0, message: `could not read pg_default_acl: ${run.error ? run.error.message : `psql exited with status ${run.status}`}`.slice(0, MAX_TEXT) }] };
  try { return { rows: parseDefaultAclRows(run.stdout), errors: [] }; } catch (e) { return { rows: [], errors: [{ line: 0, message: e.message.slice(0, MAX_TEXT) }] }; }
}

/** Apply the roles file (when given), clear the image's default privileges, apply the dump, and check pg_default_acl against what the dump declares. Everything external is injected. Returns the report. */
export function applySchemaDump({ dbUrl, stackUrl = null, dumpPath, rolesPath = null, psql = "psql", spawn = spawnSync, now = () => new Date(), readText = (p) => readFileSync(p, "utf8") }) {
  assertOracleUrl(dbUrl, stackUrl);
  const startedAt = now().toISOString();
  let rolesErrors = [];
  if (rolesPath) {
    rolesErrors = applyFile({ dbUrl, filePath: rolesPath, psql, spawn });
    if (rolesErrors.length) return buildReport({ errors: [], publicTables: null, startedAt, finishedAt: now().toISOString(), rolesApplied: false, rolesErrors });
  }
  // DRIFT-1b: empty the image's default privileges before any object exists (catalog-driven REVOKEs).
  const before = readDefaultAcl({ dbUrl, psql, spawn });
  const statements = clearDefaultAclStatements(before.rows);
  const defaultsErrors = [...before.errors];
  if (!defaultsErrors.length && statements.length) {
    const run = spawn(psql, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", statements.join("\n")], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
    defaultsErrors.push(...collectErrors(run.stderr));
    if (run.error || (run.status !== 0 && defaultsErrors.length === 0)) defaultsErrors.push({ line: 0, message: `clearing default privileges failed: ${run.error ? run.error.message : `psql exited with status ${run.status}`}`.slice(0, MAX_TEXT) });
  }
  const cleared = { statements: statements.length, owners: [...new Set(before.rows.map((r) => r.owner))].sort(), grantees: [...new Set(before.rows.map((r) => r.grantee))].sort() };
  if (defaultsErrors.length) return buildReport({ errors: [], publicTables: null, startedAt, finishedAt: now().toISOString(), rolesApplied: Boolean(rolesPath), rolesErrors, defaultsErrors, defaultAcl: { cleared, declared: 0, after: 0, scope: [...DEFAULT_ACL_SCOPE], out_of_scope: 0, extra: [], missing: [] } });
  const errors = applyFile({ dbUrl, filePath: dumpPath, psql, spawn });
  const probe = spawn(psql, [dbUrl, "-X", "-At", "-c", "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  const n = Number.parseInt(String(probe.stdout ?? "").trim(), 10);
  const declared = parseDumpDefaultAcl(readText(dumpPath));
  const after = readDefaultAcl({ dbUrl, psql, spawn });
  const cmp = compareDefaultAcl(after.rows, declared);
  const defaultAcl = { cleared, declared: declared.length, after: after.rows.length, scope: [...DEFAULT_ACL_SCOPE], out_of_scope: cmp.out_of_scope, extra: cmp.extra, missing: cmp.missing };
  return buildReport({ errors: [...errors, ...after.errors], publicTables: Number.isFinite(n) ? n : null, startedAt, finishedAt: now().toISOString(), rolesApplied: Boolean(rolesPath), rolesErrors, defaultAcl });
}

/** The one-line console summary of a report. PURE. */
export function summaryLine(report) {
  const a = report.default_acl;
  return `apply-schema-dump: ${report.ok ? "OK" : "FAILED"}; public tables ${report.public_tables}; roles applied ${report.roles_applied}; roles errors ${report.roles_errors}; fatal errors ${report.fatal_errors}; role errors ${report.role_errors}; missing roles ${report.missing_roles.join(", ") || "none"}; default privileges cleared ${a?.cleared.statements ?? 0} (owners ${a?.cleared.owners.join(", ") || "none"}), declared by the dump ${a?.declared ?? 0}, oracle after ${a?.after ?? 0}, out of scope ${a?.out_of_scope ?? 0} (compared in: ${(a?.scope ?? DEFAULT_ACL_SCOPE).map((s) => s || "cluster-wide").join(", ")}), extra ${a?.extra.length ?? 0}`;
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
  console.log(summaryLine(report));
  for (const e of report.errors.slice(0, 15)) console.error(`  line ${e.line}: ${e.message}`);
  process.exit(report.ok ? 0 : 1);
}
