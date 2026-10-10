#!/usr/bin/env node
// rls-persona-matrix.mjs -- the RLS attack matrix: every public table by every persona by every command, run on the
// disposable local stack (lane TESTS-1, 2026-10-09; CLAUDE.md rule 15, a guard is proven by attack, not by presence;
// docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md section 4 items 1 and 2).
//
// AUD-AT-1 attacked the live schema as P1 (anon) and P4 (org member) only: P2 (org viewer) and P3 (member of another
// org) had no fixture, so 605 cells each were OWED. This runner adds both. For each of the four personas
// (scripts/verify/fixtures/rls-personas.mjs) and each public base table it runs SELECT, INSERT, UPDATE, DELETE and
// TRUNCATE inside one transaction that is ALWAYS rolled back (each cell in its own savepoint, role impersonated by the
// attack engine's own statements), records the outcome class, and then evaluates three invariants:
//
//   COVERAGE   every persona has exactly (tables x 5) cells, and the catalog lists at least MIN_TABLES tables, so a
//              catalog read that returned nothing cannot pass as an empty matrix.
//   TRUNCATE   no persona may truncate any table: every TRUNCATE cell is refused 42501. (TRUNCATE is checked for privilege
//              before foreign keys are, so a refusal is the grant layer holding; a 0A000 would be a grant that exists.)
//   PROBE      no cell ends in an error that means the probe itself is broken (syntax, undefined table or column, an
//              aborted transaction, a timeout): a matrix of broken probes proves nothing.
//
// Then the seeded-row attacks (rls-persona-attacks.mjs) prove the POLICY layer on rows the fixtures seed, with controls.
//
// Outcome classes: R refused (42501, a privilege or an RLS check), Z zero rows (the statement ran, no row matched or was
// visible), A admitted (rows visible or affected, or a TRUNCATE that ran), C constraint (stopped by a 22/23/0A error AFTER
// the grant and policy layers let it through), E:<code> any other error.
//
// PUBLIC REPOSITORY RULE: the report is uploaded as a workflow artifact. It carries table names (the public schema's own
// catalog), outcome classes, SQLSTATE codes and counts. It never carries a value read from the database.
//
// LOCAL ONLY: refuses (exit 2) unless the environment is the local stack's (run-attacks.mjs assertLocalOnly), because the
// fixtures WRITE. Exit: 0 every invariant held; 1 at least one did not; 2 cannot run.
//
// Usage: node scripts/verify/attacks/rls-persona-matrix.mjs [--out-dir <dir>]   (default CP_OUT_DIR)

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "../../lib/is-main.mjs";
import { roleStatements, parseRole, runSqlAttack } from "../../proof/attacks/attack-engine.mjs";
import { assertLocalOnly } from "../../proof/attacks/run-attacks.mjs";
import { PERSONAS, personaContext, setupPersonaFixtures, teardownPersonaFixtures } from "../fixtures/rls-personas.mjs";
import { TARGETED_ATTACKS } from "./rls-persona-attacks.mjs";

export const COMMANDS = Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]);
export const MIN_TABLES = 100;
/** SQLSTATEs that mean the probe, not the policy, failed. */
export const PROBE_BROKEN = Object.freeze(["25P02", "42601", "42703", "42P01", "42883", "57014", "42P10"]);

const firstLine = (s, max = 110) => String(s ?? "").split("\n")[0].slice(0, max);
const qi = (s) => `"${String(s).replace(/"/g, '""')}"`;

export const LIST_TABLES_SQL =
  "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
  "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname";

/** Per table and per database role, a column the role may UPDATE (else the first assignable column). */
export const UPDATE_COLUMNS_SQL = `
SELECT c.relname AS name, r.rolname AS role,
  COALESCE(
    (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attgenerated = '' AND a.attidentity = '' AND has_column_privilege(r.rolname::name, c.oid, a.attnum, 'UPDATE')
       ORDER BY a.attnum LIMIT 1),
    (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attgenerated = '' AND a.attidentity = '' ORDER BY a.attnum LIMIT 1)
  ) AS col
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname, r.rolname`;

/** The probe statement of one cell. PURE. */
export function cellSql(command, table, updateColumn) {
  const t = `public.${qi(table)}`;
  switch (command) {
    case "SELECT": return `SELECT count(*)::int AS n FROM ${t}`;
    case "INSERT": return `INSERT INTO ${t} DEFAULT VALUES`;
    case "UPDATE": return updateColumn ? `UPDATE ${t} SET ${qi(updateColumn)} = ${qi(updateColumn)}` : null;
    case "DELETE": return `DELETE FROM ${t}`;
    case "TRUNCATE": return `TRUNCATE ${t}`;
    default: throw new Error(`unknown command ${command}`);
  }
}

/** Classify one observation into an outcome class. PURE. */
export function classify(command, o) {
  if (o.errored) {
    if (o.code === "42501") return "R";
    if (typeof o.code === "string" && (o.code.startsWith("22") || o.code.startsWith("23") || o.code === "0A000")) return "C";
    return `E:${o.code ?? "none"}`;
  }
  if (command === "SELECT") return Number(o.rows?.[0]?.n ?? 0) === 0 ? "Z" : "A";
  if (command === "TRUNCATE") return "A";
  return (o.rowCount ?? 0) === 0 ? "Z" : "A";
}

/** Run one cell in its own savepoint as one persona. The savepoint is always rolled back. */
async function runCell(client, persona, sql, ctx, n) {
  const setup = roleStatements(parseRole(persona.as), ctx);
  const sp = `rls_cell_${n}`;
  await client.query(`SAVEPOINT ${sp}`);
  let observed;
  try {
    for (const s of setup) await client.query(s.sql, s.params);
    const res = await client.query(sql);
    observed = { errored: false, rows: res?.rows ?? [], rowCount: res?.rowCount ?? null };
  } catch (e) {
    observed = { errored: true, code: e.code, message: firstLine(e.message) };
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  await client.query(`RELEASE SAVEPOINT ${sp}`);
  return observed;
}

/** Index the UPDATE_COLUMNS_SQL rows as "table|role" -> column. PURE. */
export function indexUpdateColumns(rows) {
  const out = new Map();
  for (const r of rows ?? []) out.set(`${r.name}|${r.role}`, r.col ?? null);
  return out;
}

/**
 * The matrix. `personas` x `tables` x COMMANDS, inside one transaction that is always rolled back. Returns the cells.
 * A table with no assignable column has no UPDATE probe: that cell is recorded "N" (not applicable), still counted.
 */
export async function runMatrix({ client, tables, updateColumns, personas = PERSONAS, ctx }) {
  const cells = [];
  let n = 0;
  await client.query("BEGIN");
  try {
    for (const persona of personas) {
      for (const table of tables) {
        for (const command of COMMANDS) {
          n += 1;
          const sql = cellSql(command, table, updateColumns.get(`${table}|${persona.role}`));
          if (sql === null) { cells.push({ persona: persona.id, table, command, outcome: "N" }); continue; }
          const o = await runCell(client, persona, sql, ctx, n);
          cells.push({ persona: persona.id, table, command, outcome: classify(command, o), ...(o.errored ? { code: o.code ?? null } : {}) });
        }
      }
    }
  } finally {
    await client.query("ROLLBACK");
  }
  return cells;
}

/** The invariants over a finished matrix. PURE. Returns the list of violations (empty when every invariant held). */
export function evaluateMatrix({ cells, tables, personas = PERSONAS }) {
  const violations = [];
  if (tables.length < MIN_TABLES) violations.push(`COVERAGE: the catalog lists ${tables.length} public tables, fewer than the ${MIN_TABLES} minimum, so the matrix cannot be trusted`);
  for (const p of personas) {
    const mine = cells.filter((c) => c.persona === p.id);
    const want = tables.length * COMMANDS.length;
    if (mine.length !== want) violations.push(`COVERAGE: persona ${p.id} (${p.name}) has ${mine.length} cells, expected ${tables.length} x ${COMMANDS.length} = ${want}`);
    const open = mine.filter((c) => c.command === "TRUNCATE" && c.outcome !== "R");
    if (open.length) violations.push(`TRUNCATE: persona ${p.id} (${p.name}) can pass the TRUNCATE privilege check on ${open.length} table(s): ${open.slice(0, 5).map((c) => c.table).join(", ")}`);
    const broken = mine.filter((c) => c.code && PROBE_BROKEN.includes(c.code));
    if (broken.length) violations.push(`PROBE: persona ${p.id} (${p.name}) has ${broken.length} cell(s) whose probe failed with ${[...new Set(broken.map((c) => c.code))].join("/")}, e.g. ${broken[0].command} ${broken[0].table}`);
  }
  return violations;
}

/** Counts per persona x command x outcome, for the report. PURE. */
export function summarize(cells) {
  const out = {};
  for (const c of cells) {
    out[c.persona] ??= {};
    out[c.persona][c.command] ??= {};
    out[c.persona][c.command][c.outcome] = (out[c.persona][c.command][c.outcome] ?? 0) + 1;
  }
  return out;
}

/** The whole run against a connected client. Always tears the fixtures down. Returns the report. */
export async function runAll({ client, now = () => new Date() }) {
  const startedAt = now().toISOString();
  const report = { suite: "rls-persona-matrix", started_at: startedAt, finished_at: null, fixtures: { created: false, error: null }, tables: 0, cells: [], summary: {}, targeted: [], violations: [] };
  try {
    await setupPersonaFixtures(client);
    report.fixtures.created = true;
  } catch (e) {
    report.fixtures.error = firstLine(e.message);
    report.violations.push(`FIXTURES: the persona fixtures were not created (${report.fixtures.error}); nothing was attacked`);
    report.finished_at = now().toISOString();
    return report;
  }
  try {
    const tables = (await client.query(LIST_TABLES_SQL)).rows.map((r) => r.name);
    const updateColumns = indexUpdateColumns((await client.query(UPDATE_COLUMNS_SQL)).rows);
    const ctx = personaContext();
    report.tables = tables.length;
    report.cells = await runMatrix({ client, tables, updateColumns, ctx });
    report.summary = summarize(report.cells);
    report.violations.push(...evaluateMatrix({ cells: report.cells, tables }));
    for (const a of TARGETED_ATTACKS) {
      let outcome;
      try {
        outcome = await runSqlAttack(client, a, ctx);
      } catch (e) {
        try { await client.query("ROLLBACK"); } catch { /* no open transaction */ }
        outcome = { status: "fail", observed: `engine error: ${firstLine(e.message)}` };
      }
      report.targeted.push({ id: a.id, persona: a.persona, invariant: a.invariant, status: outcome.status, observed: outcome.observed });
      if (outcome.status !== "pass") report.violations.push(`ATTACK ${a.id} (${a.persona}) did not hold: ${firstLine(outcome.observed, 300)}`);
    }
  } finally {
    try { await teardownPersonaFixtures(client); } catch (e) { report.fixtures.teardown_error = firstLine(e.message); }
  }
  report.finished_at = now().toISOString();
  return report;
}

function parseArgs(argv) {
  const out = { outDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out-dir") out.outDir = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return out;
}

/** The CLI body with every side effect injectable. Returns the exit code. */
export async function cliMain({
  argv = process.argv.slice(2), env = process.env,
  connect = async () => (await import("../../lib/pg-conn.mjs")).connectPg(),
  writeFile = writeFileSync, makeDir = mkdirSync, log = console.log,
}) {
  let args;
  try { args = parseArgs(argv); } catch (e) { log(`rls-persona-matrix: ${e.message}`); return 2; }
  const local = assertLocalOnly(env);
  if (!local.ok) { log("rls-persona-matrix: REFUSED, the environment is not the local stack:"); local.violations.forEach((v) => log(`  - ${v}`)); return 2; }
  const client = await connect();
  if (!client) { log("rls-persona-matrix: no database connection to the local stack. Cannot verify, exit 2."); return 2; }
  try {
    const report = await runAll({ client });
    const personas = Object.keys(report.summary);
    log(`rls-persona-matrix: ${report.tables} tables x ${COMMANDS.length} commands x ${personas.length} personas = ${report.cells.length} cells`);
    for (const t of report.targeted) log(`${t.status === "pass" ? "HELD  " : "BROKEN"} ${t.id}  ${firstLine(t.observed, 160)}`);
    for (const v of report.violations) log(`VIOLATION ${v}`);
    const outDir = args.outDir ?? env.CP_OUT_DIR ?? env.MP_OUT_DIR ?? null;
    if (outDir) {
      makeDir(outDir, { recursive: true });
      writeFile(join(outDir, "rls-persona-matrix-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
    } else {
      log("rls-persona-matrix: no output directory (--out-dir, CP_OUT_DIR or MP_OUT_DIR); the report was not written.");
    }
    return report.violations.length === 0 ? 0 : 1;
  } finally {
    await client.end?.();
  }
}

if (isMainModule(import.meta.url)) {
  process.exit(await cliMain({}));
}
