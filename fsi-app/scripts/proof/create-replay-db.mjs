#!/usr/bin/env node
// create-replay-db.mjs -- create the second, empty database the migration-file replay runs in (lane PROOF-1,
// coordinator ruling 2026-10-07: the replay is discovery and runs against `replay_check` on the same local stack,
// never in the proof schema's own database).
//
// The database is made from the stack's own `postgres` database as a TEMPLATE, immediately after the stack starts
// and BEFORE the production schema dump is applied, so it carries the auth and storage schemas and the extensions
// the migrations depend on (storage.buckets, auth.users, vault, ltree...) and none of the application tables.
// PostgreSQL refuses CREATE DATABASE ... TEMPLATE while another session is connected to the template, and the
// stack's own services (auth, storage) hold connections, so this connects to template1, terminates the other
// sessions on `postgres`, and creates the database, retrying a few times because the services reconnect.
// [HYPOTHESIS until the first run] the local `postgres` role may terminate the services' sessions; if it cannot,
// the step fails by name and the replay step (discovery) is skipped, never run in the proof database.
//
// On success the replay database's loopback URL is appended to the local env file as PROOF_REPLAY_DB_URL, which
// preflight.mjs checks like every other connection variable.
//
// Usage: node scripts/proof/create-replay-db.mjs --env-file <path>   (admin URL from PROOF_DB_URL; loopback only)
// Exit: 0 = created; 1 = could not create it; 2 = cannot run (no URL, not loopback).

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const REPLAY_DB = "replay_check";

/** The same loopback URL with another database name. PURE. */
export function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const SQL = `select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid();
drop database if exists ${REPLAY_DB};
create database ${REPLAY_DB} template postgres;`;

/** Create the database with retries. `spawn` and `sleep` are injectable. Returns { ok, attempts, message }. */
export async function createReplayDb({ adminUrl, psql = "psql", attempts = 5, spawn = spawnSync, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  assertLoopbackDbUrl(adminUrl);
  const templateUrl = withDatabase(adminUrl, "template1");
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    const r = spawn(psql, [templateUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", SQL], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
    if (!r.error && r.status === 0) return { ok: true, attempts: i, message: `${REPLAY_DB} created on attempt ${i}` };
    last = String(r.error ? r.error.message : r.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0]?.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").slice(0, 200) ?? "";
    if (i < attempts) await sleep(2000);
  }
  return { ok: false, attempts, message: `could not create ${REPLAY_DB} after ${attempts} attempts: ${last}` };
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

if (isMainModule(import.meta.url)) {
  const envFile = arg("--env-file");
  const adminUrl = process.env.PROOF_DB_URL;
  if (!envFile) { console.error("create-replay-db: --env-file <path> is required"); process.exit(2); }
  if (!adminUrl) { console.error("create-replay-db: PROOF_DB_URL is not set"); process.exit(2); }
  try { assertLoopbackDbUrl(adminUrl); } catch (e) { console.error(`create-replay-db: ${e.message}`); process.exit(2); }
  const r = await createReplayDb({ adminUrl });
  (r.ok ? console.log : console.error)(`create-replay-db: ${r.message}`);
  if (!r.ok) process.exit(1);
  appendFileSync(envFile, `export PROOF_REPLAY_DB_URL='${withDatabase(adminUrl, REPLAY_DB)}'\n`);
}
