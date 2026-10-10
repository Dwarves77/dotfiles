#!/usr/bin/env node
// scripts/proof/chain-role-check.mjs -- CHAIN-5 (lane chain5-chain-steps-on-stack, 2026-10-09): every role a replayed
// migration CREATEs must exist on the stack that replayed it AND on the schema oracle cluster.
//
// WHY. The oracle receives production's schema dump, whose GRANT and OWNER statements name production roles. A role a
// migration creates (migration 118 creates `reconciler`) is not created by pg_dump's schema dump and not by the image,
// so the oracle apply died on `role "reconciler" does not exist` (chain proof fire 6). PROOF-7 exports production's
// roles to the oracle; this step is the standing assertion that the roles the REPLAYED migrations create are present on
// both clusters, found by reading the migration files the replay actually applied (its report), never from a typed list.
//
// WHAT RUNS. Reads the replay report (applied files), scans each applied file for CREATE ROLE statements (comments
// stripped), then asks pg_roles on the stack (PROOF_DB_URL) and on the oracle (PROOF_ORACLE_DB_URL). It writes
// chain-role-check.json (role names only) and exits 1 naming every missing role and on which cluster. Zero CREATE ROLE
// statements in the applied files is also a failure: the tree carries one (migration 118), so zero means the scan or the
// report is broken, and a check that passes on nothing proves nothing.
//
// Usage: node scripts/proof/chain-role-check.mjs --replay-report <path> --out <path> [--migrations-dir <dir>]
// Exit: 0 every created role exists on both clusters; 1 a role is missing or none was found; 2 cannot run.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { assertOracleUrl } from "./apply-schema-dump.mjs";
import { assertLoopbackDbUrl, DEFAULT_MIGRATIONS_DIR } from "./replay-migrations.mjs";

/** SQL with line and block comments removed (a CREATE ROLE inside a comment creates nothing). PURE. */
export function stripSqlComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Role names a SQL text CREATEs. PURE. Matches CREATE ROLE and CREATE USER, quoted or bare. */
export function rolesCreatedBy(sql) {
  const out = new Set();
  const re = /\bCREATE\s+(?:ROLE|USER)\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi;
  for (const m of stripSqlComments(sql).matchAll(re)) out.add(m[1] ?? m[2]);
  return [...out];
}

/** The migration files a replay report says were applied (the stack prelude entry is not a file). PURE. */
export function appliedFiles(report) {
  return (report?.files ?? []).filter((f) => f?.status === "applied" && typeof f.file === "string" && !f.file.startsWith("(")).map((f) => f.file);
}

/** Compare the created roles with what each cluster holds. PURE. */
export function checkRoles({ created, stackRoles, oracleRoles }) {
  const stack = new Set(stackRoles);
  const oracle = new Set(oracleRoles);
  const missingOnStack = created.filter((r) => !stack.has(r)).sort();
  const missingOnOracle = created.filter((r) => !oracle.has(r)).sort();
  const problems = [];
  if (created.length === 0) problems.push("no CREATE ROLE statement was found in the applied migration files (migration 118 creates one); the scan or the replay report is broken");
  for (const r of missingOnStack) problems.push(`role ${r} is created by a replayed migration but is absent from the stack`);
  for (const r of missingOnOracle) problems.push(`role ${r} is created by a replayed migration but is absent from the oracle cluster`);
  return { ok: problems.length === 0, problems, created, missing_on_stack: missingOnStack, missing_on_oracle: missingOnOracle };
}

/**
 * Run the check. Everything external is injected.
 * @param {{replayReport: object, migrationsDir: string, readFile?: Function, queryStack: Function, queryOracle: Function}} args
 */
export async function runRoleCheck({ replayReport, migrationsDir, readFile = readFileSync, queryStack, queryOracle }) {
  const created = new Set();
  const unreadable = [];
  for (const f of appliedFiles(replayReport)) {
    let text;
    try { text = readFile(join(migrationsDir, f), "utf8"); } catch { unreadable.push(f); continue; }
    for (const r of rolesCreatedBy(text)) created.add(r);
  }
  const names = [...created].sort();
  const held = async (query) => (await query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [names])).map((r) => r.rolname);
  const result = checkRoles({ created: names, stackRoles: await held(queryStack), oracleRoles: await held(queryOracle) });
  for (const f of unreadable) result.problems.push(`applied migration file ${f} could not be read`);
  result.ok = result.ok && unreadable.length === 0;
  result.files_scanned = appliedFiles(replayReport).length;
  return result;
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

async function client(url) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  await c.connect();
  return c;
}

export async function main() {
  const reportPath = arg("--replay-report");
  const outPath = arg("--out");
  if (!reportPath || !outPath) { console.error("chain-role-check: --replay-report <path> and --out <path> are required"); return 2; }
  const stackUrl = process.env.PROOF_DB_URL;
  const oracleUrl = process.env.PROOF_ORACLE_DB_URL;
  if (!stackUrl || !oracleUrl) { console.error("chain-role-check: PROOF_DB_URL and PROOF_ORACLE_DB_URL must both be set"); return 2; }
  try { assertLoopbackDbUrl(stackUrl); assertOracleUrl(oracleUrl, stackUrl); } catch (e) { console.error(`chain-role-check: ${e.message}`); return 2; }
  let replayReport;
  try { replayReport = JSON.parse(readFileSync(resolve(reportPath), "utf8")); } catch (e) { console.error(`chain-role-check: cannot read the replay report: ${e.message}`); return 2; }
  const migrationsDir = arg("--migrations-dir") ? resolve(arg("--migrations-dir")) : DEFAULT_MIGRATIONS_DIR;
  let stack; let oracle;
  try {
    stack = await client(stackUrl);
    oracle = await client(oracleUrl);
  } catch (e) { console.error(`chain-role-check: cannot connect: ${e.message}`); return 2; }
  try {
    const q = (c) => async (sql, params) => (await c.query(sql, params)).rows;
    const result = await runRoleCheck({ replayReport, migrationsDir, queryStack: q(stack), queryOracle: q(oracle) });
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), JSON.stringify({ schema: "chain-proof-role-check/1", ...result }, null, 2) + "\n", "utf8");
    console.log(`chain-role-check: ${result.ok ? "OK" : "FAILED"}; ${result.created.length} created role(s) in ${result.files_scanned} applied file(s); missing on stack ${result.missing_on_stack.join(", ") || "none"}; missing on oracle ${result.missing_on_oracle.join(", ") || "none"}`);
    for (const p of result.problems) console.error(`  ${p}`);
    return result.ok ? 0 : 1;
  } finally {
    await stack.end();
    await oracle.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
