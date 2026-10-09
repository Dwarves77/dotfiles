#!/usr/bin/env node
// write-local-env.mjs -- turn `supabase status -o env` into the env file every later chain-proof step sources
// (lane PROOF-1, ruling R3, 2026-10-07).
//
// The local stack is disposable and its keys are the CLI's well-known local demo keys, but the file is still
// written 0600, the keys are masked in the job log, and the writer refuses (exit 1) unless EVERY URL it was
// given names a loopback host: a status output that somehow carried a remote host never becomes an env file.
//
// Maps (the names every chain script and pg-conn already read, so pointing the repo at the local stack is an
// env change only):
//   API_URL                          -> NEXT_PUBLIC_SUPABASE_URL, PROOF_API_URL
//   DB_URL                           -> SUPABASE_DB_URL, PROOF_DB_URL
//   DB_URL, user supabase_admin,     -> PROOF_ORACLE_DB_URL (lane PROOF-6: the schema oracle is a SECOND CLUSTER, a
//     port ORACLE_PORT, database        container of the stack's own image started by create-oracle-db.mjs; the
//     postgres                          production dump is applied there as the superuser, so pg_cron has its named
//                                       database and the replay keeps the stack's `postgres` to itself)
//   SERVICE_ROLE_KEY (or SECRET_KEY) -> SUPABASE_SERVICE_ROLE_KEY, PROOF_SERVICE_KEY
//   ANON_KEY (or PUBLISHABLE_KEY)    -> NEXT_PUBLIC_SUPABASE_ANON_KEY
//   plus CHAIN_PROOF_LOCAL=1 (pg-conn loopback mode) and SCRAPE_HOLD=off (explicit).
// The fallback key names are for newer CLI versions and are a HYPOTHESIS until the first run.
//
// THE SUPERUSER ROLE (lane PROOF-5, 2026-10-08). chain-proof run 37743372083 showed the local stack's `postgres` role
// is not a superuser (the stack's services hold superuser sessions it may not terminate). The stack's superuser is
// `supabase_admin`: [INFERRED] the Supabase CLI 2.95.4 binary configures its own service containers with
// DB_USER=supabase_admin and the same configured database password it prints as the DB_URL password; not run
// against a live stack in this lane (no container runtime), so the first chain-proof run after this change is the check.
//
// Usage: supabase status -o env | node scripts/proof/write-local-env.mjs --out <file>
// Prints `::add-mask::<value>` lines (GitHub Actions) for each key, never the keys themselves otherwise.

import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { isLoopbackHost } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";

/** Parse KEY="value" lines. PURE. */
export function parseStatusEnv(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return null; } };

/** The stack's superuser role (see the header). */
export const SUPERUSER_ROLE = "supabase_admin";

/** The same URL with another user, password kept. PURE. */
export function withUser(url, user) {
  const u = new URL(url);
  u.username = user;
  return u.toString();
}

/** Host port of the oracle cluster. Distinct from every port in fsi-app/supabase/config.toml (54320 to 54329). */
export const ORACLE_PORT = 54399;

/** The oracle cluster's URL: the stack's loopback URL with the superuser role, ORACLE_PORT and database postgres. PURE. */
export function oracleUrl(dbUrl) {
  const u = new URL(withUser(dbUrl, SUPERUSER_ROLE));
  u.port = String(ORACLE_PORT);
  u.pathname = "/postgres";
  return u.toString();
}

/** Build the local env. PURE. Throws a message naming the variable, never a value. */
export function buildLocalEnv(status) {
  const api = status.API_URL;
  const db = status.DB_URL;
  const service = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const anon = status.ANON_KEY || status.PUBLISHABLE_KEY;
  if (!api) throw new Error("status output has no API_URL");
  if (!db) throw new Error("status output has no DB_URL");
  if (!service) throw new Error("status output has no SERVICE_ROLE_KEY (or SECRET_KEY)");
  for (const [name, value] of [["API_URL", api], ["DB_URL", db]]) {
    if (!isLoopbackHost(hostOf(value))) throw new Error(`${name} does not name a loopback host; refusing to write the local env`);
  }
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: api,
    PROOF_API_URL: api,
    SUPABASE_DB_URL: db,
    PROOF_DB_URL: db,
    PROOF_ORACLE_DB_URL: oracleUrl(db),
    SUPABASE_SERVICE_ROLE_KEY: service,
    PROOF_SERVICE_KEY: service,
    CHAIN_PROOF_LOCAL: "1",
    SCRAPE_HOLD: "off",
  };
  if (anon) env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
  return env;
}

/** Render a sourceable file. Values are single-quoted; a value carrying a single quote is refused. PURE. */
export function renderEnvFile(env) {
  const lines = [];
  for (const [k, v] of Object.entries(env)) {
    if (String(v).includes("'")) throw new Error(`value for ${k} contains a single quote; refusing to render`);
    lines.push(`export ${k}='${v}'`);
  }
  return lines.join("\n") + "\n";
}

/** The values to mask in the job log. PURE. */
export function maskLines(env) {
  const secret = ["SUPABASE_SERVICE_ROLE_KEY", "PROOF_SERVICE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  return [...new Set(secret.map((k) => env[k]).filter(Boolean))].map((v) => `::add-mask::${v}`);
}

if (isMainModule(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? process.argv[i + 1] : null;
  if (!out) { console.error("write-local-env: --out <file> is required"); process.exit(2); }
  try {
    const env = buildLocalEnv(parseStatusEnv(readFileSync(0, "utf8")));
    for (const m of maskLines(env)) console.log(m);
    writeFileSync(out, renderEnvFile(env), { mode: 0o600 });
    try { chmodSync(out, 0o600); } catch { /* not supported on this platform */ }
    console.log(`write-local-env: wrote ${Object.keys(env).length} variables to the local env file`);
  } catch (e) {
    console.error(`write-local-env: ${e.message}`);
    process.exit(1);
  }
}
