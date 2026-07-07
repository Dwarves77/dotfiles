// READ-ONLY verification of migration 142 (legal-line guard). Confirms: (1) the function carries the 142
// comment; (2) the two guard patterns behave — a laundering present-tense legal claim matches, a
// forward-framed claim is exempt, a colloquial-modal claim is NOT matched; (3) blast-0 holds live — a
// sample of currently-verified items still validates to 'verified'. No writes.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const candidates = [`postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`)];
let c; for (const cs of candidates) { const cl = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 }); try { await cl.connect(); c = cl; break; } catch { try { await cl.end(); } catch {} } }
if (!c) { console.error("no DB"); process.exit(1); }

const LEGAL_REQ = '(the[[:space:]]+(regulation|law|directive|rule|act|amendment|mechanism|standard)[[:space:]]+(requires|mandates|obligates|prohibits|imposes))|(is[[:space:]]+required[[:space:]]+(under|by))|(legally[[:space:]]+required)';
const FORWARD = '(propos|would|will|expected|forthcoming|consultation|draft|anticipat|pending|set[[:space:]]+to|once[[:space:]]+(adopted|enacted)|if[[:space:]]+adopted|(by|from|effective|until)[[:space:]]+20[0-9][0-9])';
const flagged = async (t) => (await c.query(`SELECT ($1 ~* $2) AND NOT ($1 ~* $3) AS f`, [t, LEGAL_REQ, FORWARD])).rows[0].f;

console.log("=== (1) function revision ===");
const cmt = (await c.query(`SELECT obj_description('public.validate_item_provenance(uuid)'::regprocedure) AS d`)).rows[0].d;
console.log("  comment mentions migration 142:", /migration 142/.test(cmt || ""));

console.log("\n=== (2) guard pattern behaviour (true = flagged-as-laundering) ===");
const cases = [
  ["LAUNDER (present-tense enacted req)", "the regulation requires importers to surrender CBAM certificates quarterly", true],
  ["FORWARD (proposed amendment)",        "the proposed amendment would require fertilizer importers to report embedded emissions", false],
  ["FORWARD (dated future)",              "the directive mandates a 2% blend from 2030", false],
  ["COLLOQUIAL modal (legit analysis)",   "operators must adapt their fleets to remain competitive on EU lanes", false],
  ["LEGAL by/under phrasing",             "the workspace is required under the regulation to register as a producer", true],
];
let pass = 0;
for (const [label, text, expect] of cases) { const got = await flagged(text); const ok = got === expect; if (ok) pass++; console.log(`  [${ok ? "OK" : "FAIL"}] expect ${String(expect).padEnd(5)} got ${String(got).padEnd(5)} — ${label}`); }
console.log(`  ${pass}/${cases.length} pattern cases correct`);

console.log("\n=== (3) blast-0 live: sample verified items still validate ===");
const sample = (await c.query(`SELECT id, title FROM public.intelligence_items WHERE provenance_status='verified' AND is_archived=false ORDER BY id LIMIT 12`)).rows;
let stillVerified = 0;
for (const it of sample) { const rec = (await c.query(`SELECT (validate_item_provenance($1)).recommended_status AS r`, [it.id])).rows[0].r; if (rec === "verified") stillVerified++; else console.log(`  FLIP: ${it.id.slice(0,8)} -> ${rec}  ${String(it.title).slice(0,40)}`); }
console.log(`  ${stillVerified}/${sample.length} sampled verified items still validate to 'verified' (no guard-induced flips)`);
await c.end(); process.exit(0);
