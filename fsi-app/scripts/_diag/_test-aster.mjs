// Test the ASTERISK-OPTIONAL label regex BEFORE another migration apply: does it (a) fix the real cause
// (asterisk-less labels "Operational implication:" the model emits without markdown bold), (b) stay STRICT
// on genuinely-missing labels (legal-line guard), (c) not break the with-asterisk + parenthetical variants.
// Simulates the criterion-4 ANALYSIS check (section ~* re AND section ILIKE %claim%) across the 9 items.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cands = [`postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`)];
let c; for (const cs of cands) { const cl = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 }); try { await cl.connect(); c = cl; break; } catch { try { await cl.end(); } catch {} } }
if (!c) { console.error("no DB"); process.exit(1); }

// ASTERISK-OPTIONAL (the candidate fix): leading/trailing \* optional, parenthetical optional.
const AOPT = "\\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)([[:space:]]*\\([^)]*\\))?:\\*?";

console.log("=== regex behaviour (asterisk-optional) ===");
const cases = [
  ["Operational implication: For road freight", true, "ASTERISK-LESS (the real cause)"],
  ["*Industry interpretation:* foo", true, "with asterisks"],
  ["*Industry interpretation (academic):* foo", true, "asterisks + parenthetical"],
  ["Analytical inference: if smaller vessels", true, "asterisk-less 2"],
  ["the regulation requires X", false, "MISSING label — STRICT (legal-line guard)"],
  ["operators must adapt their fleets", false, "binding modal, no label — STRICT"],
  ["*Bogus label:* foo", false, "unrecognized token"],
];
let pass = 0;
for (const [t, exp, lbl] of cases) { const got = (await c.query("SELECT ($1 ~* $2) AS m", [t, AOPT])).rows[0].m; const ok = got === exp; if (ok) pass++; console.log(`  [${ok ? "OK" : "FAIL"}] expect ${String(exp).padEnd(5)} got ${String(got).padEnd(5)} ${lbl}`); }
console.log(`  ${pass}/${cases.length} regex cases`);

console.log("\n=== simulate criterion-4 ANALYSIS check across the 9 (fails with AOPT) ===");
const NINE = ["7a0ead55","e2e03e1b","782878c0","5cc10a6d","8c186db2","15f63ea9","51b2c91e","6a857887","1e80067a"];
const all = (await c.query("SELECT id FROM intelligence_items WHERE is_archived=false")).rows.map((r) => r.id);
for (const p of NINE) {
  const id = all.find((x) => x.startsWith(p)); if (!id) continue;
  const an = (await c.query("SELECT claim_text FROM section_claim_provenance WHERE intelligence_item_id=$1 AND claim_kind='ANALYSIS'", [id])).rows;
  let fails = 0;
  for (const a of an) {
    const r = (await c.query(
      "SELECT EXISTS(SELECT 1 FROM intelligence_item_sections s WHERE s.item_id=$1 AND s.content_md ~* $2 AND s.content_md ILIKE '%'||$3||'%') AS ok",
      [id, AOPT, a.claim_text])).rows[0].ok;
    if (!r) fails++;
  }
  console.log(`  ${p} ANALYSIS=${an.length} would-fail-label=${fails}`);
}
await c.end(); process.exit(0);
