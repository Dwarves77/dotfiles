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
// creates the database, retrying a few times because the services reconnect.
// [HYPOTHESIS until the first run] the local `postgres` role may terminate the services' sessions; if it cannot, the
// step fails by name and the job fails: the oracle gate cannot run without it.
//
// On success the oracle database's loopback URL is appended to the local env file as PROOF_ORACLE_DB_URL, which
// preflight.mjs checks like every other connection variable.
//
// Usage: node scripts/proof/create-oracle-db.mjs --env-file <path>   (admin URL from PROOF_DB_URL; loopback only)
// Exit: 0 = created; 1 = could not create it; 2 = cannot run (no URL, not loopback).

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

const SQL = `select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid();
drop database if exists ${ORACLE_DB};
create database ${ORACLE_DB} template postgres;`;

/** Create the database with retries. `spawn` and `sleep` are injectable. Returns { ok, attempts, message }. */
export async function createOracleDb({ adminUrl, psql = "psql", attempts = 5, spawn = spawnSync, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  assertLoopbackDbUrl(adminUrl);
  const templateUrl = withDatabase(adminUrl, "template1");
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    const r = spawn(psql, [templateUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", SQL], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
    if (!r.error && r.status === 0) return { ok: true, attempts: i, message: `${ORACLE_DB} created on attempt ${i}` };
    last = String(r.error ? r.error.message : r.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0]?.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").slice(0, 200) ?? "";
    if (i < attempts) await sleep(2000);
  }
  return { ok: false, attempts, message: `could not create ${ORACLE_DB} after ${attempts} attempts: ${last}` };
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const envFile = arg("--env-file");
  const adminUrl = process.env.PROOF_DB_URL;
  if (!envFile) { console.error("create-oracle-db: --env-file <path> is required"); process.exit(2); }
  if (!adminUrl) { console.error("create-oracle-db: PROOF_DB_URL is not set"); process.exit(2); }
  try { assertLoopbackDbUrl(adminUrl); } catch (e) { console.error(`create-oracle-db: ${e.message}`); process.exit(2); }
  const r = await createOracleDb({ adminUrl });
  (r.ok ? console.log : console.error)(`create-oracle-db: ${r.message}`);
  if (!r.ok) process.exit(1);
  appendFileSync(envFile, `export PROOF_ORACLE_DB_URL='${withDatabase(adminUrl, ORACLE_DB)}'\n`);
}
