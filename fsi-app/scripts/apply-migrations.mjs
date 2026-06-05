/** Apply migration SQL files faithfully via a direct Postgres connection (DDL-capable).
 *  Usage: node scripts/apply-migrations.mjs 129_market_required_slots 130_technology_required_slots ...
 *  Idempotent migrations only (ON CONFLICT DO NOTHING / CREATE OR REPLACE). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = process.env.SUPABASE_DB_PASSWORD;
if (!pw) { console.error("SUPABASE_DB_PASSWORD missing"); process.exit(1); }

// Try direct host first, then the session pooler (IPv4) across common regions.
const candidates = [
  `postgresql://postgres:${encodeURIComponent(pw)}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1", "us-east-2", "us-west-1", "eu-central-1", "eu-west-1", "eu-west-2", "ap-southeast-1", "ap-southeast-2"].map(
    (r) => `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-0-${r}.pooler.supabase.com:5432/postgres`
  ),
];

async function connect() {
  for (const cs of candidates) {
    const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try { await client.connect(); console.log(`connected via ${cs.replace(/:[^:@]+@/, ":***@")}`); return client; }
    catch (e) { console.log(`  ✗ ${cs.split("@")[1]?.split("/")[0]}: ${e.message.slice(0, 60)}`); try { await client.end(); } catch {} }
  }
  throw new Error("no working DB connection");
}

const files = process.argv.slice(2);
if (!files.length) { console.error("pass migration basenames"); process.exit(1); }
const client = await connect();
try {
  for (const f of files) {
    const sql = readFileSync(resolve(ROOT, "supabase/migrations", f.endsWith(".sql") ? f : f + ".sql"), "utf8");
    await client.query(sql);
    console.log(`✓ applied ${f}`);
  }
} catch (e) { console.error(`✗ apply failed: ${e.message}`); process.exitCode = 1; }
finally { await client.end(); }
