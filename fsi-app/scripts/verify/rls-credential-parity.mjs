/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: remediation-discipline (§4 — credential hygiene /
 *  migration coordination; class-over-instance) + caros-ledge-platform-intent (tenancy integrity).
 *
 *  RLS-CREDENTIAL PARITY (the reconciler class — the exact gap migration 169 fixed). On an RLS-enabled
 *  table, a table-level GRANT is INERT unless a matching RLS POLICY also permits the (role, command):
 *  Postgres RLS denies by default, so a role granted INSERT/UPDATE/DELETE/SELECT with NO policy covering
 *  that command silently cannot use the grant (the reconciler cred that was granted but had no WITH CHECK /
 *  USING policy). This audit compares, per (table, command, grantee), the GRANTs (information_schema.
 *  role_table_grants) against the POLICIES (pg_policies) and flags every GRANT-WITHOUT-POLICY.
 *
 *  Read-only (pg_catalog + information_schema; no writes, no network beyond the DB). pg-direct via the
 *  pooler (mirrors vocab-sync-audit). Exit 0 = every grant on an RLS table is backed by a covering policy;
 *  exit 1 = at least one grant-without-policy; exit 2 = engine/cred error (honest, never a false green).
 *
 *  SCOPE (honest — LOW-FALSE-POSITIVE by construction, per the invariants exemption-process rule):
 *  the check flags a grant-without-policy ONLY for CUSTOM application roles (e.g. `reconciler`) — NOT for
 *  `anon`/`authenticated`. Reason: anon/authenticated are the RLS-GATED PUBLIC roles; the standard Supabase
 *  posture is BROAD table grants to them + RLS default-deny, so a "missing policy" there is the INTENDED
 *  default-deny (the grant is inert BY DESIGN), not a defect — flagging it would fire on every stock project.
 *  The reconciler class (migration 169) is precisely a CUSTOM role granted a write it cannot use for lack of
 *  a USING/WITH CHECK policy; that is what this audit targets. The managed/superuser roles bypass RLS and
 *  need no policy. It does NOT judge whether an EXISTING policy's predicate is semantically CORRECT (that is
 *  the reconcile-revalidate end-to-end proof); a covering policy clears the parity flag. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }

// Roles NOT checked (see SCOPE): managed/superuser roles bypass RLS, and anon/authenticated are the
// RLS-gated public roles whose missing-policy is the intended default-deny. Everything else is a CUSTOM
// application role (the reconciler class) — those ARE checked. `pg_*` roles are skipped by prefix below.
const EXCLUDED_ROLES = new Set([
  "postgres", "supabase_admin", "service_role", "supabase_storage_admin", "supabase_auth_admin",
  "supabase_functions_admin", "supabase_read_only_user", "supabase_realtime_admin",
  "supabase_replication_admin", "supabase_etl_admin", "authenticator", "dashboard_user", "pgbouncer",
  "PUBLIC", "anon", "authenticated",
]);
const isCustomRole = (r) => !EXCLUDED_ROLES.has(r) && !r.startsWith("pg_");
// The commands RLS gates. `ALL` on the policy side covers every command.
const COMMANDS = ["SELECT", "INSERT", "UPDATE", "DELETE"];

function connString() {
  let ref, pool;
  try {
    ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
    pool = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
  } catch {
    return null;
  }
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!pw) return null;
  return pool.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(pw)}@`);
}

const CONN = connString();
if (!CONN) {
  console.error("rls-credential-parity: no DB creds (supabase/.temp/{project-ref,pooler-url} + SUPABASE_DB_PASSWORD). Cannot run — failing honest (exit 2).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: CONN });
try {
  await client.connect();

  // RLS-enabled public tables.
  const rls = await client.query(`
    SELECT c.relname AS table
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
    ORDER BY 1;`);
  const rlsTables = new Set(rls.rows.map((r) => r.table));

  // Non-bypass grants on those tables.
  const grants = await client.query(`
    SELECT table_name AS table, grantee, privilege_type AS priv
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
    ORDER BY 1,2,3;`);

  // Policies: cmd + the roles they apply to.
  const policies = await client.query(`
    SELECT tablename AS table, cmd, roles, permissive
    FROM pg_policies WHERE schemaname = 'public';`);

  // Build coverage: table -> command -> Set(roles) that a PERMISSIVE policy grants (roles '{public}' = all).
  const covered = new Map(); // `${table}::${cmd}` -> { roles:Set, public:bool }
  const mark = (table, cmd, roles) => {
    const key = `${table}::${cmd}`;
    let e = covered.get(key);
    if (!e) { e = { roles: new Set(), public: false }; covered.set(key, e); }
    for (const r of roles || []) { if (r === "public") e.public = true; else e.roles.add(r); }
  };
  for (const p of policies.rows) {
    if (p.permissive && p.permissive !== "PERMISSIVE") continue; // restrictive policies do not GRANT access
    const cmds = p.cmd === "ALL" ? COMMANDS : [p.cmd];
    for (const c of cmds) mark(p.table, c, p.roles);
  }
  const isCovered = (table, cmd, role) => {
    const e = covered.get(`${table}::${cmd}`);
    return Boolean(e && (e.public || e.roles.has(role)));
  };

  const customRoles = new Set(grants.rows.map((g) => g.grantee).filter(isCustomRole));
  const gaps = [];
  for (const g of grants.rows) {
    if (!rlsTables.has(g.table)) continue;    // no RLS => grant is fully effective
    if (!isCustomRole(g.grantee)) continue;   // managed roles bypass; anon/authenticated = intended default-deny
    if (!isCovered(g.table, g.priv, g.grantee)) {
      gaps.push({ table: g.table, role: g.grantee, priv: g.priv });
    }
  }

  if (gaps.length === 0) {
    console.log(`rls-credential-parity: OK — every grant to a CUSTOM role on an RLS-enabled table is backed by a covering policy (${rlsTables.size} RLS tables, custom roles checked: ${[...customRoles].join(", ") || "(none)"}).`);
    await client.end();
    process.exit(0);
  }

  console.error(`rls-credential-parity: ${gaps.length} GRANT-WITHOUT-POLICY finding(s) on CUSTOM roles (the reconciler class):`);
  for (const g of gaps) console.error(`  [${g.table}] role='${g.role}' has ${g.priv} grant but NO covering RLS policy`);
  console.error(`\n  A grant with no matching policy is inert (RLS denies by default): a custom role that is ` +
    `SUPPOSED to write silently fails. Add a policy for the (role, command) or revoke the dead grant. ` +
    `This is the migration-169 reconciler-cred gap generalized.`);
  await client.end();
  process.exit(1);
} catch (e) {
  console.error(`rls-credential-parity: engine error — ${e.message}`);
  try { await client.end(); } catch { /* ignore */ }
  process.exit(2);
}
