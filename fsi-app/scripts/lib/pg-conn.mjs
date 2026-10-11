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
