/** DATA-AUDIT (CI-with-secrets lane). GOVERNING SKILLS: environmental-policy-and-innovation + source-credibility-model.
 *
 *  VOCAB SYNC: the in-code metadata vocabularies (src/lib/agent/metadata-vocab.ts DB_*_VALUES) MUST match
 *  the DB CHECK constraints on intelligence_items (severity/priority/urgency_tier/format_type/signal_band/
 *  theme). A drift between the two is the class that silently rejected whole-row writes (the severity
 *  3-way fracture). Reads pg_get_constraintdef from the catalog (pg-direct) and compares each constraint's
 *  allowed string set to the matching metadata-vocab Set. Exit 1 on any drift. Read-only. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import pg from "pg";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env from secrets */ }
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const V = await jiti.import("../../src/lib/agent/metadata-vocab.ts");

// column -> the metadata-vocab Set that should equal its CHECK constraint
const COLS = {
  severity: V.DB_SEVERITY_VALUES, priority: V.DB_PRIORITY_VALUES, urgency_tier: V.DB_URGENCY_TIER_VALUES,
  format_type: V.DB_FORMAT_TYPE_VALUES, signal_band: V.DB_SIGNAL_BAND_VALUES, theme: V.DB_THEME_VALUES,
};

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || "");
const candidates = [
  `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
  ...["us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","ap-southeast-1","ap-southeast-2"].map((r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`),
];
let client;
for (const cs of candidates) { const c = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 }); try { await c.connect(); client = c; break; } catch { try { await c.end(); } catch {} } }
if (!client) { console.error("[vocab-sync] no DB connection"); process.exit(2); }

let drift = 0;
try {
  const defs = (await client.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.intelligence_items'::regclass AND contype='c'`)).rows;
  for (const [col, set] of Object.entries(COLS)) {
    if (!set) { console.log(`  [skip] ${col}: no metadata-vocab Set exported`); continue; }
    // find the CHECK that constrains this column (mentions the column name + string literals)
    const hit = defs.find((d) => new RegExp(`\\b${col}\\b`).test(d.def) && /'/.test(d.def));
    if (!hit) { console.log(`  WARN ${col}: no CHECK constraint found in catalog`); drift++; continue; }
    const dbVals = new Set([...hit.def.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((v) => v !== "text"));
    const codeVals = new Set([...set]);
    const inDbNotCode = [...dbVals].filter((v) => !codeVals.has(v));
    const inCodeNotDb = [...codeVals].filter((v) => !dbVals.has(v));
    if (inDbNotCode.length || inCodeNotDb.length) {
      drift++;
      console.log(`  DRIFT ${col} (constraint ${hit.conname}): db-not-code=[${inDbNotCode.join(",")}] code-not-db=[${inCodeNotDb.join(",")}]`);
    } else {
      console.log(`  OK   ${col}: ${dbVals.size} values match`);
    }
  }
} finally { await client.end(); }

console.log(`[vocab-sync] columns checked: ${Object.keys(COLS).length} | drift: ${drift}`);
if (drift) { console.log("\nFAIL: metadata-vocab DB_*_VALUES drifted from the live CHECK constraints. Reconcile the vocab SoT."); process.exit(1); }
console.log("PASS: every metadata vocabulary matches its live CHECK constraint.");
process.exit(0);
