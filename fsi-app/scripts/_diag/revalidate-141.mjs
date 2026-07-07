/** Corpus revalidation after migration 141 (status-is-a-cache). Captures research_finding + technology
 *  status before/after the per-type floor. pg-direct. --apply to commit the UPDATE. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const candidates = [
  `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r)=>`postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`),
];
let client;
for (const cs of candidates) { const c = new pg.Client({ connectionString: cs, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:8000 }); try { await c.connect(); client=c; console.log(`connected via ${cs.split("@")[1].split("/")[0]}`); break; } catch { try{await c.end();}catch{} } }
if (!client) { console.error("no DB connection"); process.exit(1); }
const SNAP = `SELECT item_type, provenance_status, count(*)::int n FROM intelligence_items WHERE NOT is_archived AND item_type IN ('research_finding','technology','innovation','tool') GROUP BY 1,2 ORDER BY 1,2`;
try {
  await client.query("SET statement_timeout = 0");
  const before = (await client.query(SNAP)).rows;
  console.log("BEFORE (research/tech):", JSON.stringify(before));
  if (!APPLY) { console.log("\nDRY-RUN — pass --apply to revalidate."); process.exit(0); }
  const upd = await client.query(`UPDATE public.intelligence_items i
      SET provenance_status = v.rec
      FROM (SELECT id, (validate_item_provenance(id)).recommended_status AS rec
              FROM public.intelligence_items WHERE NOT is_archived) v
     WHERE i.id = v.id AND i.provenance_status IS DISTINCT FROM v.rec`);
  console.log(`revalidated; ${upd.rowCount} item(s) changed status corpus-wide.`);
  const after = (await client.query(SNAP)).rows;
  console.log("AFTER  (research/tech):", JSON.stringify(after));
  console.log("\nAPPLIED.");
} catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
finally { await client.end(); }
process.exit(0);
