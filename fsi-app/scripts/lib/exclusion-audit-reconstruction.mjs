// D3 (c) — exclusion-audit LAYER 3 (real-artifact reconstruction). READ-ONLY (SELECTs).
//
// The non-negotiable acceptance (design S1(c), operator ruling): (c) must
// INDEPENDENTLY re-surface the ~420 reachability-rejections — arrive at "N candidates
// rejected on reachability via a now-unreliable fetch method -> likely real sources
// wrongly excluded" — WITHOUT being told to look at source_verifications or the 420.
// It falls out of the cross-product: source_verifications is a registered exclusion
// surface, reachability maps to plain-fetch-reachability which is a registered
// unreliable method. The number is a live count, never hardcoded.
//
// Negative control (required): exclusions made by a RELIABLE method — duplicate
// (dedup), ingest parse/granularity/geo/type rejections, manual suspensions — must
// NOT be flagged. "Surfaced the 420" only means something if the legitimate
// exclusions are left clean.
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { auditExclusions, describe } from "./exclusion-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const REF = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const POOL = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = POOL.replace(`postgres.${REF}@`, `postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);

let fails = 0;
const ok = (label, cond, detail = "") => {
  console.log(`  [${cond ? "OK" : "FAIL"}] ${label}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};

console.log("=== (c) L3 — real-artifact reconstruction (live source_verifications) ===\n");

const c = new pg.Client({ connectionString: CONN });
await c.connect();
let result;
try {
  result = await auditExclusions(c);
} finally {
  await c.end();
}
const { flagged, clean, groups } = result;

// ── BINDING: the 420 must FALL OUT (independent re-derivation) ──
console.log("Cross-product flagged groups (exclusion-surface x unreliable-method):");
for (const g of flagged) console.log(`  * ${describe(g)}`);

const reach = flagged.find((g) => g.surface === "source_verifications" && g.method === "plain-fetch-reachability");
ok("INDEPENDENTLY surfaced the reachability-via-plain-fetch exclusion group", !!reach);
ok("the count fell out of the live cross-product (not hardcoded)", !!reach && reach.count === 420, reach ? `count=${reach.count}` : "absent");
ok("flagged group derives the recover-candidate conclusion", !!reach && /wrongly excluded|recover-candidate/.test(describe(reach)));

// ── NEGATIVE CONTROL: legitimate exclusions left clean ──
console.log("\nNegative control — legitimate exclusions must be CLEAN (not flagged):");
const dup = clean.find((g) => g.surface === "source_verifications" && g.rawSignal === "duplicate");
ok("duplicate (dedup) exclusion is CLEAN, not flagged", !!dup, dup ? `count=${dup.count} method=${dup.method}` : "missing");
const ingestClean = clean.filter((g) => g.surface === "ingest_rejections");
const ingestFlagged = flagged.filter((g) => g.surface === "ingest_rejections");
ok("ALL ingest_rejections exclusions are CLEAN (content determinations, reliable)", ingestFlagged.length === 0 && ingestClean.length > 0, `${ingestClean.length} clean groups, ${ingestFlagged.length} flagged`);
const susp = clean.find((g) => g.surface === "sources_suspended");
ok("manual suspension is CLEAN, not flagged", !susp || susp.method === "manual-suspension");

// ── VACUITY GUARD: (c) flags ONLY the unreliable group, nothing else ──
ok("vacuity guard — EXACTLY one flagged group (the unreliable one), not a blanket flag",
   flagged.length === 1, `${flagged.length} flagged of ${groups.length} total groups`);

// ── coverage: the surfaces were walked ──
const walked = new Set(result.coverage.walked.map((w) => w.surface));
ok("coverage WALKED source_verifications + ingest_rejections + sources_suspended",
   walked.has("source_verifications") && walked.has("ingest_rejections") && walked.has("sources_suspended"),
   [...walked].join(", "));

console.log(`\n  group census: ${groups.map((g) => `${g.surface}/${g.rawSignal ?? "null"}=${g.count}`).join("  ")}`);
console.log(`\n${fails === 0
  ? "(c) L3 PASS — the 420 reachability-exclusions FELL OUT of the cross-product (independent of being told to look); duplicate/ingest/suspended exclusions left CLEAN; exactly one flagged group."
  : fails + " (c) L3 FAILURE(S)"}`);
process.exitCode = fails === 0 ? 0 : 1;
