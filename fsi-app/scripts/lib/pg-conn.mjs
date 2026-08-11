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
 *  Returns a CONNECTED pg.Client, or null if no candidate connects. Callers exit 2 on null (cannot-verify,
 *  never a silent pass). Read-only helper: connecting is the only side effect. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const POOLER_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "eu-central-1", "eu-west-1", "eu-west-2",
  "ap-southeast-1", "ap-southeast-2",
];

/** Every candidate connection string, in resolution order. Exported for tests; secrets never logged. */
export function candidateConnStrings(env = process.env) {
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

/** Connect using the first working candidate. Returns a connected pg.Client, or null. */
export async function connectPg() {
  for (const cs of candidateConnStrings()) {
    const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await c.connect(); return c; } catch { try { await c.end(); } catch { /* ignore */ } }
  }
  return null;
}
