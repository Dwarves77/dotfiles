// Phase 2 #43 binding — READ-ONLY introspection probe. Zero writes.
// Learns the real role/ownership facts that decide whether a DB-level guard can
// be impossible-by-construction against the credentials the agent actually holds:
//   - who the pooler credential connects AS, and its role attributes
//   - whether that role can DISABLE TRIGGER / bypass RLS / SET ROLE
//   - the owner of intelligence_items (owner can ALTER/DISABLE any guard)
//   - what service_role can do (the named adversary in the #43 invariant)
//   - existing triggers on intelligence_items
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

const c = new pg.Client({ connectionString: CONN });
await c.connect();
const q = async (label, sql, params) => {
  try { const r = await c.query(sql, params); console.log(`\n## ${label}`); console.dir(r.rows, { depth: 4 }); }
  catch (e) { console.log(`\n## ${label}\n  ERROR: ${e.message}`); }
};

await q("connected as (current_user / session_user)", "SELECT current_user, session_user");
await q("my role attributes", `
  SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
  FROM pg_roles WHERE rolname = current_user`);
await q("roles I am a member of (can SET ROLE into)", `
  SELECT r.rolname AS can_set_role_to
  FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
  WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ORDER BY 1`);
await q("intelligence_items owner", `
  SELECT t.tablename, t.tableowner, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
  FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename
  WHERE t.tablename = 'intelligence_items'`);
await q("can current_user disable triggers on intelligence_items? (owner or super)", `
  SELECT
    (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items') = current_user AS i_am_owner,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS i_am_super,
    pg_has_role(current_user, (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items'), 'USAGE') AS i_can_assume_owner`);
await q("service_role attributes (the named #43 adversary)", `
  SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcanlogin
  FROM pg_roles WHERE rolname = 'service_role'`);
await q("does service_role own intelligence_items?", `
  SELECT (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items') = 'service_role' AS service_role_is_owner`);
await q("can service_role SET ROLE into the owner?", `
  SELECT pg_has_role('service_role', (SELECT tableowner FROM pg_tables WHERE tablename='intelligence_items'), 'USAGE') AS service_role_can_assume_owner`);
await q("existing triggers on intelligence_items", `
  SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
  FROM pg_trigger WHERE tgrelid = 'public.intelligence_items'::regclass AND NOT tgisinternal
  ORDER BY tgname`);
await q("table-level privileges on intelligence_items by grantee", `
  SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
  WHERE table_name = 'intelligence_items'
  GROUP BY grantee ORDER BY grantee`);
await q("set_provenance_status security mode (definer/invoker) + owner", `
  SELECT p.proname, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS fn_owner
  FROM pg_proc p WHERE p.proname IN ('set_provenance_status','validate_item_provenance')`);
await q("current provenance_status distribution (read-only)", `
  SELECT provenance_status, count(*) FROM public.intelligence_items GROUP BY 1 ORDER BY 2 DESC`);
await q("does a 'reconciler' role already exist?", `
  SELECT rolname FROM pg_roles WHERE rolname ILIKE '%reconcil%' OR rolname ILIKE '%restrict%'`);

await c.end();
console.log("\n=== probe complete (read-only; nothing written) ===");
