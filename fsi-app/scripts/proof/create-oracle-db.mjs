#!/usr/bin/env node
// create-oracle-db.mjs -- create the empty database that holds the schema ORACLE (lane PROOF-1, coordinator reversal
// 2026-10-07). The stack's own database gets its schema from the migration-file replay; the schema-only dump of
// production is applied to this second database (apply-schema-dump.mjs), and schema-diff.mjs must find the two
// identical.
//
// The database is made from the stack's own `postgres` database as a TEMPLATE, immediately after the stack starts
// and BEFORE the replay runs, so it carries the auth and storage schemas and the extensions the dump depends on
// (storage.buckets, auth.users, vault, ltree...) and none of the application tables. PostgreSQL refuses CREATE
// DATABASE ... TEMPLATE while another session is connected to the template, and the stack's own services (auth,
// storage) hold connections, so this connects to template1, terminates the other sessions on `postgres`, and
// creates the database, retrying a few times because the services reconnect. The three statements (terminate, drop
// if exists, create) go to one psql invocation as three separate -c arguments with ON_ERROR_STOP: each -c is its own
// transaction, which DROP DATABASE and CREATE DATABASE require (lane PROOF-5b, 2026-10-08: [CONFIRMED] by
// chain-proof run 37748342640, where one -c string holding all three failed with "DROP DATABASE cannot run inside
// a transaction block").
// [CONFIRMED by chain-proof run 37743372083, lane PROOF-5, 2026-10-08] the local `postgres` role is NOT a superuser:
// terminating the stack's services' sessions failed with "Only roles with the SUPERUSER attribute may terminate
// processes of roles with the SUPERUSER attribute" on all 5 attempts. This one statement block therefore runs as the
// stack's superuser (PROOF_DB_SUPERUSER_URL, written by write-local-env.mjs, loopback-asserted by preflight.mjs and
// again here). Nothing else changes: PROOF_ORACLE_DB_URL stays on the ordinary `postgres` role.
//
// On success the oracle database's loopback URL is appended to the local env file as PROOF_ORACLE_DB_URL, which
// preflight.mjs checks like every other connection variable.
//
// Usage: node scripts/proof/create-oracle-db.mjs --env-file <path>   (superuser URL from PROOF_DB_SUPERUSER_URL, the
//        oracle URL's role from PROOF_DB_URL; loopback only)
// Exit: 0 = created; 1 = could not create it; 2 = cannot run (a URL variable absent, not loopback).

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const ORACLE_DB = "oracle_check";

/** The same loopback URL with another database name. PURE. */
export function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

// Three statements, each passed to psql as its OWN -c argument. psql runs every -c as a separate command, so each is
// its own transaction; one -c string holding all three is a single implicit transaction, in which DROP DATABASE and
// CREATE DATABASE are refused ("DROP DATABASE cannot run inside a transaction block", chain-proof run 37748342640).
export const STATEMENTS = Object.freeze([
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid()",
  `drop database if exists ${ORACLE_DB}`,
  `create database ${ORACLE_DB} template postgres`,
]);

/** Create the database with retries. `spawn` and `sleep` are injectable. Returns { ok, attempts, message }. */
export async function createOracleDb({ superuserUrl, psql = "psql", attempts = 5, spawn = spawnSync, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  assertLoopbackDbUrl(superuserUrl);
  const templateUrl = withDatabase(superuserUrl, "template1");
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    const r = spawn(psql, [templateUrl, "-X", "-v", "ON_ERROR_STOP=1", ...STATEMENTS.flatMap((s) => ["-c", s])], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
    if (!r.error && r.status === 0) return { ok: true, attempts: i, message: `${ORACLE_DB} created on attempt ${i}` };
    last = String(r.error ? r.error.message : r.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0]?.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").slice(0, 200) ?? "";
    if (i < attempts) await sleep(2000);
  }
  return { ok: false, attempts, message: `could not create ${ORACLE_DB} after ${attempts} attempts: ${last}` };
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

/** Validate the inputs the CLI needs. PURE. Returns { error } naming the variable, or { superuserUrl, oracleUrl }. */
export function resolveInputs({ envFile, env }) {
  if (!envFile) return { error: "--env-file <path> is required" };
  for (const name of ["PROOF_DB_URL", "PROOF_DB_SUPERUSER_URL"]) {
    if (!env[name]) return { error: `${name} is not set` };
    try { assertLoopbackDbUrl(env[name]); } catch (e) { return { error: `${name}: ${e.message}` }; }
  }
  return { superuserUrl: env.PROOF_DB_SUPERUSER_URL, oracleUrl: withDatabase(env.PROOF_DB_URL, ORACLE_DB) };
}

if (isMainModule(import.meta.url)) {
  const inputs = resolveInputs({ envFile: arg("--env-file"), env: process.env });
  if (inputs.error) { console.error(`create-oracle-db: ${inputs.error}`); process.exit(2); }
  const r = await createOracleDb({ superuserUrl: inputs.superuserUrl });
  (r.ok ? console.log : console.error)(`create-oracle-db: ${r.message}`);
  if (!r.ok) process.exit(1);
  appendFileSync(arg("--env-file"), `export PROOF_ORACLE_DB_URL='${inputs.oracleUrl}'\n`);
}
