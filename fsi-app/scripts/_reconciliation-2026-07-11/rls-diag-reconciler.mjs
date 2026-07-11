/** Diagnose the reconciler RLS WITH CHECK failure on intelligence_items (all rolled back). */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const conn = POOL.replace(`postgres.${REF}`, `reconciler.${REF}`)
  .replace(`reconciler.${REF}@`, `reconciler.${REF}:${encodeURIComponent(process.env.RECONCILER_DB_PASSWORD)}@`);
const ID = "007f42b1-265a-4504-8bd1-ea1557d410ad";

const c = new pg.Client({ connectionString: conn });
await c.connect();
console.log("as:", (await c.query("SELECT current_user")).rows[0].current_user);

async function probe(label, sql, params = []) {
  await c.query("BEGIN");
  try { const r = await c.query(sql, params); console.log(`${label}: OK (rows=${r.rowCount ?? "-"})`); }
  catch (e) { console.log(`${label}: FAIL ${e.code} — ${e.message.split("\n")[0]}`); }
  await c.query("ROLLBACK");
}

// visibility
const vis = await c.query("SELECT provenance_status FROM public.intelligence_items WHERE id=$1", [ID]);
console.log(`visible: ${vis.rowCount ? vis.rows[0].provenance_status : "NOT VISIBLE"}`);

// a: benign update, no flip, no trigger-relevant change? (updated_at triggers the flip trigger — the repro)
await probe("(a) touch updated_at (fires trigger->flip)", "UPDATE public.intelligence_items SET updated_at=now() WHERE id=$1", [ID]);
// b: direct status flip, bypassing the revalidation trigger's inner update ordering
await probe("(b) direct SET provenance_status='quarantined'", "UPDATE public.intelligence_items SET provenance_status='quarantined', provenance_verified_at=NULL WHERE id=$1", [ID]);
// c: update a harmless column that does NOT change status (trigger still fires + revalidates + inner-updates)
await probe("(c) SET title=title", "UPDATE public.intelligence_items SET title=title WHERE id=$1", [ID]);

// raw catalog: restrictive policies? per-policy roles/kinds on both tables
const cat = await c.query(`
  SELECT c.relname, p.polname, p.polpermissive, p.polcmd, pg_get_expr(p.polqual, p.polrelid) AS qual,
         pg_get_expr(p.polwithcheck, p.polrelid) AS with_check,
         (SELECT array_agg(rolname) FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  WHERE c.relname IN ('intelligence_items') ORDER BY c.relname, p.polname`);
for (const r of cat.rows) console.log(`policy ${r.relname}.${r.polname} perm=${r.polpermissive} cmd=${r.polcmd} roles=${r.roles} qual=${r.qual} check=${r.with_check}`);
await c.end();
