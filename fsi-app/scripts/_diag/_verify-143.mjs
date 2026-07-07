// Verify migration 143: (1) the variant-tolerant label regex compiles + behaves (tolerant of valid
// variants, STRICT on missing); (2) validate_item_provenance runs (regex valid at RUNTIME) on the 9
// enacted items + reports the new failure set; (3) no verified item flips (relax-only).
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

// EXACT migration regex (matches c_label_re after SQL un-escaping).
const RE = "\\*?(per the workspace's reading|analytical inference|industry interpretation|operational implication)([[:space:]]*\\([^)]*\\))?:\\*?";
console.log("=== (1) regex behaviour (tolerant of variants, STRICT on missing) ===");
const cases = [
  ["*Industry interpretation:* foo", true, "exact (relabel marker)"],
  ["*Industry interpretation (academic):* foo", true, "VARIANT parenthetical"],
  ["*Analytical inference:* foo", true, "exact"],
  ["*Operational implication (mode-specific):* x", true, "variant 2"],
  ["the regulation requires X", false, "MISSING label — must stay strict (legal-line guard)"],
  ["*Bogus label:* foo", false, "unrecognized token — must reject"],
];
let pass = 0;
for (const [t, exp, lbl] of cases) { const got = (await c.query("SELECT ($1 ~* $2) AS m", [t, RE])).rows[0].m; const ok = got === exp; if (ok) pass++; console.log(`  [${ok ? "OK" : "FAIL"}] expect ${String(exp).padEnd(5)} got ${String(got).padEnd(5)} ${lbl}`); }
console.log(`  ${pass}/${cases.length} regex cases`);

console.log("\n=== (2) validate runs at RUNTIME on the 9 (regex valid in-function) ===");
const NINE = ["7a0ead55","e2e03e1b","782878c0","5cc10a6d","8c186db2","15f63ea9","51b2c91e","6a857887","1e80067a"];
const all = (await c.query("SELECT id FROM intelligence_items WHERE is_archived=false")).rows.map((r) => r.id);
let verified = 0;
for (const p of NINE) {
  const id = all.find((x) => x.startsWith(p)); if (!id) { console.log(`  ${p} not found`); continue; }
  try {
    const v = (await c.query("SELECT (validate_item_provenance($1)).valid AS valid, (validate_item_provenance($1)).failures AS failures", [id])).rows[0];
    const reasons = [...new Set((v.failures || []).map((f) => f.reason))];
    if (v.valid) verified++;
    console.log(`  ${p} ${v.valid ? "VERIFIED ✓" : "quarantined"} | ${reasons.join(", ") || "clean"}`);
  } catch (e) { console.log(`  ${p} VALIDATE THREW: ${String(e.message).slice(0, 70)}`); }
}
console.log(`\n  VERIFIED after 143: ${verified}/9`);

console.log("\n=== (3) no-flip: sample verified items still verify (relax-only) ===");
const sample = (await c.query("SELECT id FROM intelligence_items WHERE provenance_status='verified' AND is_archived=false ORDER BY id LIMIT 15")).rows;
let still = 0; for (const it of sample) { const r = (await c.query("SELECT (validate_item_provenance($1)).recommended_status AS r", [it.id])).rows[0].r; if (r === "verified") still++; }
console.log(`  ${still}/${sample.length} sampled verified items still verified`);
await c.end(); process.exit(0);
