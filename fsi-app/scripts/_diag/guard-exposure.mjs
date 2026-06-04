/** guard-exposure.mjs — READ-ONLY: is the provenance flip-guard actually enforcing? */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const c = new pg.Client({ connectionString: CONN }); await c.connect();
try {
  const me = await c.query(`SELECT current_user, session_user, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_super`);
  console.log("connected as:", JSON.stringify(me.rows[0]));
  const trg = await c.query(`SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname ILIKE '%provenance%' OR tgname ILIKE '%guard%'`);
  console.log(`\nprovenance/guard triggers: ${trg.rows.length}`);
  for (const t of trg.rows) console.log(`  ${t.tgname} enabled=${t.tgenabled} (O=enabled, D=disabled)\n    ${t.def.slice(0,160)}`);
  const roles = await c.query(`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('reconciler','postgres','service_role','authenticator') ORDER BY rolname`);
  console.log(`\nrelevant roles:`);
  for (const r of roles.rows) console.log(`  ${r.rolname}: super=${r.rolsuper} bypassrls=${r.rolbypassrls} login=${r.rolcanlogin}`);
} finally { await c.end(); }
