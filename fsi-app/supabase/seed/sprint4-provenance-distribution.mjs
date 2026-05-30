/**
 * sprint4-provenance-distribution.mjs — READ-ONLY. Prints the live
 * provenance_status distribution across all intelligence_items, and asserts
 * how many are at 'verified'. Used as the pre-check before any CREATE OR
 * REPLACE of validate_item_provenance: the set_provenance_status trigger
 * re-evaluates the function on every future UPDATE, so we confirm there is
 * nothing currently at 'verified' that a re-evaluation could silently re-grade.
 * No writes.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const PW = process.env.SUPABASE_DB_PASSWORD;
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(PW)}@`);

const c = new Client({ connectionString: CONN });
await c.connect();
const { rows } = await c.query(
  `SELECT provenance_status::text AS s, count(*)::int AS n
     FROM public.intelligence_items GROUP BY provenance_status ORDER BY provenance_status`
);
console.log("provenance_status distribution (all intelligence_items):");
let verified = 0;
for (const r of rows) {
  console.log(`  ${r.s}: ${r.n}`);
  if (r.s === "verified") verified = r.n;
}
console.log(
  `VERIFIED COUNT = ${verified} ${verified === 0 ? "(SAFE: no live item to re-grade)" : "*** NONZERO — re-evaluation could disturb live items ***"}`
);
await c.end();
