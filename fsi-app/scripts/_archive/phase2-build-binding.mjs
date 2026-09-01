// Phase 2 #43 binding — BUILD step. Applies migration 118 (the binding schema) and
// activates the scoped non-owner `reconciler` login role with a generated secret kept
// ONLY in .env.local (gitignored). One-time DDL — needs the owner/createrole privilege,
// so it connects as postgres. This is the BUILD; the FLIP runs as reconciler (separate).
//
// Idempotent: re-running re-applies 118 (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY
// IF EXISTS) and re-ALTERs the reconciler login. Read-then-verify; no corpus mutation.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertExecutedDataOp } from "./_dataops/interlock.mjs";
assertExecutedDataOp("phase2-build-binding", { applied: "2026-06-01", commit: "61f86cd", effect: "apply migration 118 + create reconciler role (re-ALTERs role password)", idempotent: true });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");
process.loadEnvFile(ENV_PATH);
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const ownerConn = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

// ── 1. reconciler password: reuse if present, else generate + persist ──
let pw = process.env.RECONCILER_DB_PASSWORD;
if (!pw) {
  pw = randomBytes(24).toString("hex"); // 48 hex chars; safe in conn strings everywhere
  const envText = readFileSync(ENV_PATH, "utf8");
  const sep = envText.endsWith("\n") ? "" : "\n";
  appendFileSync(ENV_PATH, `${sep}# Sprint 4 Phase 2 #43 bound reconciler credential (non-owner, scoped)\nRECONCILER_DB_PASSWORD=${pw}\n`);
  console.log("[build] generated RECONCILER_DB_PASSWORD and appended to .env.local");
} else {
  console.log("[build] reusing existing RECONCILER_DB_PASSWORD from .env.local");
}

const c = new pg.Client({ connectionString: ownerConn });
await c.connect();

// ── 2. apply migration 118 (the binding schema) ──
const sql = readFileSync(resolve(ROOT, "supabase/migrations/118_provenance_flip_binding.sql"), "utf8");
console.log("[build] applying migration 118_provenance_flip_binding.sql ...");
await c.query(sql);
console.log("[build] migration 118 applied.");

// ── 3. activate reconciler login with the secret (kept out of the committed SQL) ──
await c.query(`ALTER ROLE reconciler LOGIN PASSWORD '${pw}'`);
console.log("[build] reconciler role activated (LOGIN, scoped password set).");

// ── 4. verify the build BY CONSTRUCTION (read-back the role + objects) ──
const show = async (label, q, p) => { const r = await c.query(q, p); console.log(`\n## ${label}`); console.dir(r.rows, { depth: 4 }); return r.rows; };

await show("reconciler role attributes (must be non-owner, non-super, non-bypassrls, login)", `
  SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
  FROM pg_roles WHERE rolname = 'reconciler'`);
await show("reconciler memberships (must NOT include postgres / service_role / any privileged role)", `
  SELECT r.rolname AS member_of
  FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
  WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname='reconciler') ORDER BY 1`);
await show("reconciler does NOT own intelligence_items", `
  SELECT (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items') AS owner,
         (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items') = 'reconciler' AS reconciler_is_owner`);
await show("guard + stamp triggers present and ENABLED (tgenabled='O')", `
  SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid='public.intelligence_items'::regclass
    AND tgname IN ('guard_provenance_flip_trg','stamp_prov_origin_trg') ORDER BY tgname`);
await show("reconciler column-scoped UPDATE grant on intelligence_items (only the 3 columns)", `
  SELECT column_name, privilege_type FROM information_schema.column_privileges
  WHERE table_name='intelligence_items' AND grantee='reconciler' ORDER BY column_name`);
await show("reconciler table grants (SELECT broad; INSERT only on integrity_flags)", `
  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants WHERE grantee='reconciler'
  GROUP BY table_name ORDER BY table_name`);
await show("reconciler RLS policies", `
  SELECT schemaname||'.'||tablename AS tbl, policyname, cmd
  FROM pg_policies WHERE policyname LIKE '%reconciler%' ORDER BY 1,2`);

await c.end();
console.log("\n=== BUILD complete. Binding schema applied; reconciler activated as a non-owner scoped login. ===");
console.log("Next: scripts/phase2-verify-binding.mjs (3-layer verify), then scripts/phase2-reconcile.mjs (flip via reconciler).");
