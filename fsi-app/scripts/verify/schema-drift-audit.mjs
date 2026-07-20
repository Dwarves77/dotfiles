/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILL: remediation-discipline (§4 category "Migration
 *  coordination" + the two-track migration policy). SCHEMA-DRIFT: the apply-then-commit-later window.
 *
 *  The census was burned TWICE by this exact class: census_worklist (migration 221) and
 *  coverage_gap_census_findings (migration 222) each existed LIVE in the database with NO committed
 *  migration at the moment their first consumer needed them, so a consumer had to introspect pg_catalog
 *  to learn a shape the repo did not yet record. The two-track policy says schema DDL is committed before
 *  (or with) the dependent code; a live object with no committed CREATE is that policy violated.
 *
 *  This audit introspects the live public schema (tables + views + materialized views) and diffs the
 *  object names against every CREATE TABLE / CREATE VIEW in supabase/migrations/. A live object with no
 *  committed CREATE and no allowlist entry is DRIFT. The allowlist carries objects that legitimately have
 *  no migration source, each with a stated reason; the allowlist is itself audited for stale entries (an
 *  entry that is no longer live, or that now HAS a committed source, is reported for removal).
 *
 *  Three states (0/1/2, the sibling-audit convention): exit 0 = no drift and no stale allowlist entries;
 *  exit 1 = at least one drift or stale entry (REPORTED, fails the hard lane); exit 2 = no DB creds /
 *  engine error (cannot verify — the C4-style "cannot check here" state).
 *
 *  Read-only (information_schema + pg_matviews + fs read). pg-direct via the pooler. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { readMigrationSql } from "../../.discipline/lib/read-migration-sql.mjs";
import { committedObjectNames, diffSchema, staleAllowlistEntries } from "./lib/schema-drift.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }

// Objects legitimately live with no committed migration source. Each entry names WHY and a review path.
// The allowlist is audited: when an entry's object gains a committed CREATE (or stops being live), the
// staleness check flags it for removal — the allowlist cannot silently outlive its reason.
const ALLOWLIST = {
  // Genuine drift found by this audit's FIRST run (2026-07-20): a view over coverage_gap_candidates, live
  // with no committed CREATE anywhere in supabase/migrations/. Routed to Session B to author the migration
  // (or DROP the view if it is superseded/dead). Remove this entry when the migration lands — the
  // staleness check will flag it the moment coverage of a committed CREATE appears.
  acquisition_backlog_v: "pre-existing drift, routed to Session B for a retroactive migration; review-by: next-census-management-pass",
};

function connString() {
  let ref, pool;
  try {
    ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
    pool = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
  } catch { return null; }
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!pw) return null;
  return pool.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(pw)}@`);
}

function readAllMigrations() {
  const dir = resolve(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  return files.map((f) => readMigrationSql(resolve(dir, f)));
}

const CONN = connString();
if (!CONN) {
  console.error("schema-drift-audit: no DB creds (supabase/.temp/* + SUPABASE_DB_PASSWORD). Cannot verify against live schema — exit 2.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: CONN });
try {
  await client.connect();
  const { rows } = await client.query(`
    SELECT table_name AS name,
           CASE WHEN table_type = 'BASE TABLE' THEN 'table' ELSE 'view' END AS kind
    FROM information_schema.tables
    WHERE table_schema = 'public'
    UNION ALL
    SELECT matviewname AS name, 'matview' AS kind
    FROM pg_matviews WHERE schemaname = 'public';`);

  const liveObjects = rows.map((r) => ({ name: r.name, kind: r.kind }));
  const liveNames = new Set(liveObjects.map((o) => String(o.name).toLowerCase()));
  const committed = committedObjectNames(readAllMigrations());

  const drift = diffSchema({ liveObjects, committed, allowlist: ALLOWLIST });
  const stale = staleAllowlistEntries({ liveNames, committed, allowlist: ALLOWLIST });

  console.log(`schema-drift-audit: ${liveObjects.length} live public objects, ${committed.size} committed CREATEs, ${Object.keys(ALLOWLIST).length} allowlisted.`);

  if (drift.length === 0 && stale.length === 0) {
    console.log("PASS — every live public object traces to a committed CREATE (or a reasoned allowlist entry); no stale allowlist entries.");
    process.exit(0);
  }

  if (drift.length) {
    console.error(`\nDRIFT — ${drift.length} live object(s) with no committed CREATE (schema shipped ahead of its versioned source):`);
    for (const d of drift) console.error(`  ${d.kind.padEnd(8)} ${d.name}  — ${d.reason}`);
    console.error("  Remediation: author the missing migration (CREATE ... IF NOT EXISTS, byte-matching the live object) and commit it, OR drop the object if it is dead. If it is a known pre-existing drift, add a reasoned ALLOWLIST entry with a review-by tag.");
  }
  if (stale.length) {
    console.error(`\nSTALE ALLOWLIST — ${stale.length} entry(ies) that no longer need the exemption:`);
    for (const s of stale) console.error(`  ${s.name}  — ${s.reason}`);
  }
  process.exit(1);
} catch (e) {
  console.error(`schema-drift-audit: engine/cred error — ${e instanceof Error ? e.message : String(e)}. Exit 2.`);
  process.exit(2);
} finally {
  try { await client.end(); } catch { /* ignore */ }
}
