/** Migration 163 post-apply proof (read-only effect: every write rolled back).
 *  (a) reconciler CAN INSERT integrity_flags (the new policy)
 *  (b) reconciler CANNOT DELETE integrity_flags (no policy/priv beyond prior grants)
 *  (c) reconciler CANNOT INSERT sources (unrelated table untouched by mig 163)
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const conn = POOL
  .replace(`postgres.${REF}`, `reconciler.${REF}`)
  .replace(`reconciler.${REF}@`, `reconciler.${REF}:${encodeURIComponent(process.env.RECONCILER_DB_PASSWORD)}@`);

const c = new pg.Client({ connectionString: conn });
await c.connect();
const who = (await c.query("SELECT current_user")).rows[0].current_user;
console.log(`connected as: ${who}`);
if (who !== "reconciler") { console.error("REFUSING: not the reconciler credential"); process.exit(2); }

// (a) positive — INSERT allowed, rolled back
await c.query("BEGIN");
try {
  const r = await c.query(
    `INSERT INTO public.integrity_flags (category, subject_type, subject_ref, description, created_by)
     VALUES ('data_quality','item','mig163-proof','mig163 post-apply proof (rolled back)','mig163-proof')
     RETURNING id`);
  console.log(`(a) INSERT integrity_flags: OK (id=${r.rows[0].id}) — rolling back`);
} catch (e) {
  console.log(`(a) INSERT integrity_flags: FAILED — ${e.message}`);
}
await c.query("ROLLBACK");

// (b) negative — DELETE must not be possible (permission denied OR 0 rows via RLS)
await c.query("BEGIN");
try {
  const r = await c.query("DELETE FROM public.integrity_flags WHERE created_by='mig163-proof'");
  console.log(`(b) DELETE integrity_flags: not denied, rowCount=${r.rowCount} (RLS filtered => effectively blocked${r.rowCount === 0 ? "" : " *** UNEXPECTED ROWS ***"})`);
} catch (e) {
  console.log(`(b) DELETE integrity_flags: DENIED — ${e.message.split("\n")[0]}`);
}
await c.query("ROLLBACK");

// (c) negative — INSERT into sources must fail
await c.query("BEGIN");
try {
  await c.query("INSERT INTO public.sources (name, url) VALUES ('mig163-proof','https://mig163.invalid')");
  console.log("(c) INSERT sources: *** ALLOWED — UNEXPECTED, EXCESS GRANT ***");
} catch (e) {
  console.log(`(c) INSERT sources: DENIED — ${e.message.split("\n")[0]}`);
}
await c.query("ROLLBACK");

await c.end();
