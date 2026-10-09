#!/usr/bin/env node
// create-oracle-db.mjs -- start the schema ORACLE cluster (lane PROOF-1, reduced by lane PROOF-6, 2026-10-09,
// coordinator ruling 2026-10-09: "Option A, in its lightest form").
//
// The oracle is a SECOND POSTGRES CLUSTER, not a second database. chain-proof run 37876624407 applied the production
// schema dump to a scratch database (oracle_check) as the stack's ordinary `postgres` role and failed with "must be
// owner of schema public" and "can only create extension in database postgres" (2738 fatal errors). [HYPOTHESIS, not
// yet verified: the extension message is pg_cron's own restriction to its configured database, which a role change
// cannot lift; the next chain-proof fire on master shows what line 16 of the dump is.] The replay owns the stack's
// `postgres` database, so the dump gets its own cluster, where `postgres` is free: a container of the SAME
// `supabase/postgres` image and tag the local stack runs (read from the running stack with `docker ps`, never typed
// here), on a distinct loopback host port (ORACLE_PORT in write-local-env.mjs), database `postgres`, applied as
// `supabase_admin` (apply-schema-dump.mjs, psql ON_ERROR_STOP=1). The image creates the roles the dump names
// (postgres, anon, authenticated, service_role, supabase_admin); a role it does not have is a red step downstream,
// never a strip.
//
// The container's password is the stack's own database password (the CLI's well-known local default, read from
// PROOF_DB_URL); PROOF_ORACLE_DB_URL is written by write-local-env.mjs, so this script only starts the container
// that URL names and waits until the image's init has created the roles.
//
// Usage: node scripts/proof/create-oracle-db.mjs   (reads PROOF_DB_URL and PROOF_ORACLE_DB_URL from the environment;
//        loopback only). Teardown is `docker rm -f chain-proof-oracle` in the workflow's final step.
// Exit: 0 = ready; 1 = could not start or never became ready; 2 = cannot run (a URL absent, not loopback, wrong shape).

import { spawnSync } from "node:child_process";
import { assertLoopbackDbUrl } from "./replay-migrations.mjs";
import { SUPERUSER_ROLE } from "./write-local-env.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const ORACLE_CONTAINER = "chain-proof-oracle";
/** The roles the image must have created before the dump is applied; readiness waits for all of them. */
export const READY_ROLES = Object.freeze(["postgres", "anon", "authenticated", "service_role", SUPERUSER_ROLE]);
export const READY_QUERY = `select count(*) from pg_roles where rolname in (${READY_ROLES.map((r) => `'${r}'`).join(", ")})`;

/** The image of the running stack's database container. PURE over an injected `spawn`. Returns { image } or { error }. */
export function stackImage({ spawn = spawnSync } = {}) {
  const r = spawn("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Image}}"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return { error: `docker ps failed: ${String(r.error ? r.error.message : r.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0] ?? ""}`.slice(0, 200) };
  const image = String(r.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return image ? { image } : { error: "no running supabase_db_ container found; the oracle needs the stack's image" };
}

/** Validate the two URLs. PURE. Returns { error } naming the variable, or { password, port }. */
export function resolveInputs({ env }) {
  for (const name of ["PROOF_DB_URL", "PROOF_ORACLE_DB_URL"]) {
    if (!env[name]) return { error: `${name} is not set` };
    try { assertLoopbackDbUrl(env[name]); } catch (e) { return { error: `${name}: ${e.message}` }; }
  }
  const stack = new URL(env.PROOF_DB_URL);
  const oracle = new URL(env.PROOF_ORACLE_DB_URL);
  if (oracle.username !== SUPERUSER_ROLE) return { error: `PROOF_ORACLE_DB_URL must name the ${SUPERUSER_ROLE} role` };
  if (oracle.pathname !== "/postgres") return { error: "PROOF_ORACLE_DB_URL must name the database postgres" };
  if (!oracle.port || oracle.port === stack.port) return { error: "PROOF_ORACLE_DB_URL must name a host port other than the stack's" };
  const password = decodeURIComponent(stack.password);
  if (!password) return { error: "PROOF_DB_URL carries no password to give the oracle container" };
  return { password, port: oracle.port };
}

/** Start the container and wait for readiness. `spawn` and `sleep` are injectable. Returns { ok, attempts, message }. */
export async function startOracle({ oracleUrl, password, port, image, psql = "psql", attempts = 60, spawn = spawnSync, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  assertLoopbackDbUrl(oracleUrl);
  const run = spawn("docker", ["run", "-d", "--name", ORACLE_CONTAINER, "-e", `POSTGRES_PASSWORD=${password}`, "-p", `127.0.0.1:${port}:5432`, image], { encoding: "utf8" });
  if (run.error || run.status !== 0) {
    const why = String(run.error ? run.error.message : run.stderr ?? "").trim().split(/\r?\n/).slice(-1)[0] ?? "";
    return { ok: false, attempts: 0, message: `could not start ${ORACLE_CONTAINER} from ${image}: ${why.replace(password, "<pw>")}`.slice(0, 300) };
  }
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    const r = spawn(psql, [oracleUrl, "-X", "-At", "-c", READY_QUERY], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "5" } });
    if (!r.error && r.status === 0 && String(r.stdout ?? "").trim() === String(READY_ROLES.length)) return { ok: true, attempts: i, message: `${ORACLE_CONTAINER} ready on attempt ${i} (image ${image})` };
    last = String(r.error ? r.error.message : r.stderr || r.stdout || "").trim().split(/\r?\n/).slice(-1)[0]?.replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>").slice(0, 200) ?? "";
    if (i < attempts) await sleep(2000);
  }
  return { ok: false, attempts, message: `${ORACLE_CONTAINER} not ready after ${attempts} attempts: ${last}` };
}

if (isMainModule(import.meta.url)) {
  const inputs = resolveInputs({ env: process.env });
  if (inputs.error) { console.error(`create-oracle-db: ${inputs.error}`); process.exit(2); }
  const img = stackImage();
  if (img.error) { console.error(`create-oracle-db: ${img.error}`); process.exit(1); }
  const r = await startOracle({ oracleUrl: process.env.PROOF_ORACLE_DB_URL, password: inputs.password, port: inputs.port, image: img.image });
  (r.ok ? console.log : console.error)(`create-oracle-db: ${r.message}`);
  if (!r.ok) process.exit(1);
}
