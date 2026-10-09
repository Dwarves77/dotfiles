#!/usr/bin/env node
// preflight.mjs -- the chain-proof job's isolation check (lane PROOF-1, ruling R3, 2026-10-07).
//
// The chain-proof job proves the data layer on a disposable local Supabase stack. Its safety rests on one
// fact: after the subset export, every step runs with the LOCAL stack's environment only. This script
// asserts that fact, at the start of every later step, and fails the job if it is false. It checks the
// process environment it is given; it never reads a database and never prints a value, only variable names.
//
// WHAT IT REFUSES (each a named violation):
//   1. a forbidden credential name present and non-empty: SUPABASE_DB_PASSWORD, APP_URL, WORKER_SECRET,
//      GH_TOKEN, GITHUB_TOKEN, ANTHROPIC_API_KEY, BROWSERLESS_API_KEY, any VERCEL_* name, and the other
//      production credentials (RECONCILER_DB_PASSWORD, SUPABASE_ACCESS_TOKEN, the portal and data-source keys).
//      The two read credentials for the subset export live in the export step's own env and are the only
//      production values the job ever holds.
//   2. a production host in the connection variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_URL,
//      DATABASE_URL, PROOF_DB_URL, PROOF_API_URL, PROOF_ORACLE_DB_URL must each be a URL on a loopback host when set;
//      NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_URL are required. PROOF_ORACLE_DB_URL (written by write-local-env.mjs,
//      lane PROOF-6) must also name the supabase_admin role, the database postgres, and a port other than the stack's
//      (the same assertions create-oracle-db.mjs applies); PROOF_DB_SUPERUSER_URL is retired and no longer checked.
//   3. a production hostname inside ANY variable's value (supabase.co, supabase.com, carosledge.com,
//      vercel.app, vercel.com), whatever the variable is called.
//   4. CHAIN_PROOF_LOCAL not equal to "1" (the loopback mode of scripts/lib/pg-conn.mjs must be on).
//   5. a service-role key that is not provably the local stack's: SUPABASE_SERVICE_ROLE_KEY must equal
//      PROOF_SERVICE_KEY (both written from `supabase status` by write-local-env.mjs).
//
// Exit 0 = clean, 1 = at least one violation (names printed), never a silent pass.

import { isLoopbackHost } from "../lib/pg-conn.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import { SUPERUSER_ROLE } from "./write-local-env.mjs";

export const FORBIDDEN_NAMES = Object.freeze([
  "SUPABASE_DB_PASSWORD",
  "APP_URL",
  "WORKER_SECRET",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "ANTHROPIC_API_KEY",
  "BROWSERLESS_API_KEY",
  "RECONCILER_DB_PASSWORD",
  "SUPABASE_ACCESS_TOKEN",
  "LIVE_SMOKE_EMAIL",
  "LIVE_SMOKE_PASSWORD",
  "EIA_API_KEY",
  "DATA_GOV_API_KEY",
  "NREL_API_KEY",
  "REGULATIONS_GOV_API_KEY",
  "IMODOCS_USERNAME",
  "IMODOCS_PASSWORD",
]);

export const FORBIDDEN_PREFIXES = Object.freeze(["VERCEL_"]);

export const PRODUCTION_HOST_MARKERS = Object.freeze(["supabase.co", "supabase.com", "carosledge.com", "vercel.app", "vercel.com"]);

const URL_VARS = Object.freeze(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL", "DATABASE_URL", "PROOF_DB_URL", "PROOF_API_URL", "PROOF_ORACLE_DB_URL"]);
const REQUIRED_URL_VARS = Object.freeze(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL"]);

const present = (v) => typeof v === "string" && v.trim() !== "";

function hostOf(value) {
  try { return new URL(value).hostname; } catch { return null; }
}

/** Check an environment. PURE. Returns { ok, violations: string[] }; a violation names variables, never values. */
export function checkPreflight(env = process.env) {
  const violations = [];

  for (const name of Object.keys(env)) {
    if (!present(env[name])) continue;
    if (FORBIDDEN_NAMES.includes(name) || FORBIDDEN_PREFIXES.some((p) => name.startsWith(p))) {
      violations.push(`forbidden credential present: ${name}`);
    }
  }

  for (const name of URL_VARS) {
    const value = env[name];
    if (!present(value)) {
      if (REQUIRED_URL_VARS.includes(name)) violations.push(`required local variable missing: ${name}`);
      continue;
    }
    if (!isLoopbackHost(hostOf(value))) violations.push(`${name} does not name a loopback host`);
  }

  if (present(env.PROOF_ORACLE_DB_URL) && hostOf(env.PROOF_ORACLE_DB_URL) !== null) {
    const oracle = new URL(env.PROOF_ORACLE_DB_URL);
    if (oracle.username !== SUPERUSER_ROLE) violations.push(`PROOF_ORACLE_DB_URL must name the ${SUPERUSER_ROLE} role`);
    if (oracle.pathname !== "/postgres") violations.push("PROOF_ORACLE_DB_URL must name the database postgres");
    const stackPort = present(env.PROOF_DB_URL) && hostOf(env.PROOF_DB_URL) !== null ? new URL(env.PROOF_DB_URL).port : "";
    if (!oracle.port || oracle.port === stackPort) violations.push("PROOF_ORACLE_DB_URL must name a host port other than the stack's");
  }

  for (const [name, value] of Object.entries(env)) {
    if (!present(value)) continue;
    const lower = value.toLowerCase();
    if (PRODUCTION_HOST_MARKERS.some((m) => lower.includes(m))) {
      violations.push(`production host named in ${name}`);
    }
  }

  if (env.CHAIN_PROOF_LOCAL !== "1") violations.push("CHAIN_PROOF_LOCAL is not 1 (pg-conn loopback mode is off)");

  if (present(env.SUPABASE_SERVICE_ROLE_KEY)) {
    if (!present(env.PROOF_SERVICE_KEY)) {
      violations.push("SUPABASE_SERVICE_ROLE_KEY is set but PROOF_SERVICE_KEY is not: cannot prove it is the local key");
    } else if (env.SUPABASE_SERVICE_ROLE_KEY !== env.PROOF_SERVICE_KEY) {
      violations.push("SUPABASE_SERVICE_ROLE_KEY differs from PROOF_SERVICE_KEY: not the local stack's key");
    }
  }

  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

if (isMainModule(import.meta.url)) {
  const { ok, violations } = checkPreflight(process.env);
  if (ok) {
    console.log("chain-proof preflight: ok (local stack environment only)");
  } else {
    console.error("chain-proof preflight: REFUSED");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}
