/** SHARED direct-Postgres connection resolver for the data-audit lane. GOVERNING: remediation-discipline.
 *
 *  ONE resolver instead of six copies. Before this file, every pg-direct audit carried its own connection
 *  logic, and they disagreed: vocab-sync derived working pooler candidates from NEXT_PUBLIC_SUPABASE_URL +
 *  SUPABASE_DB_PASSWORD (and was green in CI), while schema-drift / rls-credential-parity /
 *  column-existence-parity / prov-guard-adversarial read supabase/.temp/{project-ref,pooler-url} — artifacts
 *  of a local `supabase link` that are correctly ABSENT from a fresh CI checkout — and pause-flag-guard-proof
 *  wanted SUPABASE_DB_URL/DATABASE_URL that the workflow never injected. Result: five audits exited 2 on
 *  every nightly run since they were wired in (lane diagnosis 2026-08-11), with a runner comment asserting
 *  they "run for real in the secrets lane". The duplicate that worked folds in here; the ones that lied die.
 *
 *  Resolution order (first connection that succeeds wins):
 *    1. SUPABASE_DB_URL, then DATABASE_URL — explicit operator-provided connection string.
 *    2. supabase/.temp/{project-ref,pooler-url} + SUPABASE_DB_PASSWORD — local dev after `supabase link`.
 *    3. Candidates derived from NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD — the CI path; exactly the
 *       secrets the data-audit-lane workflow already injects. Direct db host first, then regional poolers
 *       (mirrors what vocab-sync-audit proved green in CI).
 *
 *  LOOPBACK MODE (lane PROOF-1, ruling R2, 2026-10-07): the chain-proof job runs these scripts against a
 *  disposable local database and must never reach production, whatever else is in the env. When
 *  CHAIN_PROOF_LOCAL=1, or the first explicit URL (SUPABASE_DB_URL, else DATABASE_URL) has a loopback host,
 *  the candidate list holds loopback URLs ONLY: no supabase/.temp pooler, no host derived from
 *  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD, no non-loopback explicit URL. A loopback connection
 *  carries no TLS (a local Postgres does not speak it). If the local database refuses, the result is null
 *  (callers exit 2), never a quiet fall-through to a production host.
 *
 *  Returns a CONNECTED pg.Client, or null if no candidate connects. Callers exit 2 on null (cannot-verify,
 *  never a silent pass). Read-only helper: connecting is the only side effect. `pg` is loaded inside
 *  connectPg(), not at module load, so the pure helpers here are importable without npm packages. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const POOLER_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "eu-central-1", "eu-west-1", "eu-west-2",
  "ap-southeast-1", "ap-southeast-2",
];

/** True for a loopback host name: 127.0.0.1, localhost, ::1 (bare or bracketed). Anything else, including a
 *  name that merely starts with 127.0.0.1, is false. */
export function isLoopbackHost(host) {
  if (typeof host !== "string") return false;
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

function hostOf(connString) {
  try { return new URL(connString).hostname; } catch { return null; }
}

/** Is this env in loopback mode? CHAIN_PROOF_LOCAL=1, or the first explicit URL names a loopback host. */
export function inLoopbackMode(env = process.env) {
  if (env.CHAIN_PROOF_LOCAL === "1") return true;
  const first = env.SUPABASE_DB_URL || env.DATABASE_URL;
  return Boolean(first) && isLoopbackHost(hostOf(first));
}

/** The pg.Client options for one candidate: no TLS to loopback, the existing relaxed TLS to anything else. */
export function connectOptionsFor(connString) {
  const ssl = isLoopbackHost(hostOf(connString)) ? false : { rejectUnauthorized: false };
  return { connectionString: connString, ssl, connectionTimeoutMillis: 8000 };
}

/** Every candidate connection string, in resolution order. Exported for tests; secrets never logged. */
export function candidateConnStrings(env = process.env) {
  if (inLoopbackMode(env)) {
    return [env.SUPABASE_DB_URL, env.DATABASE_URL].filter((u) => u && isLoopbackHost(hostOf(u)));
  }
  const out = [];
  if (env.SUPABASE_DB_URL) out.push(env.SUPABASE_DB_URL);
  if (env.DATABASE_URL) out.push(env.DATABASE_URL);
  const pwRaw = env.SUPABASE_DB_PASSWORD;
  if (pwRaw) {
    const pw = encodeURIComponent(pwRaw);
    try {
      const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
      const pool = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
      out.push(pool.replace(`postgres.${ref}@`, `postgres.${ref}:${pw}@`));
    } catch { /* no local supabase link — CI or fresh checkout */ }
    if (env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
        out.push(`postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`);
        for (const r of POOLER_REGIONS) out.push(`postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`);
      } catch { /* malformed URL — nothing to derive */ }
    }
  }
  return out;
}

/** Connect using the first working candidate. Returns a connected pg.Client, or null.
 *  `env` and `createClient` are injectable for tests; production callers pass nothing. */
export async function connectPg({ env = process.env, createClient } = {}) {
  let make = createClient;
  if (!make) {
    const { default: pg } = await import("pg");
    make = (opts) => new pg.Client(opts);
  }
  for (const cs of candidateConnStrings(env)) {
    const c = make(connectOptionsFor(cs));
    try { await c.connect(); return c; } catch { try { await c.end(); } catch { /* ignore */ } }
  }
  return null;
}
