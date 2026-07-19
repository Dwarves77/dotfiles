#!/usr/bin/env node
// surface-contract-gate.golden.mjs — structural + fixture golden for the every-decline-names-the-
// five-contracts doctrine (operator dispatch + ruling 2026-07-17: scope verdicts failed three times
// this week by testing against ONE customer surface instead of the five contracts).
//
// PROVES the surface-contract scope gate WITHOUT touching production data (the gate is DORMANT — the
// operator ruled no seed rows: nothing in coverage_gap_candidates was ever declined, so the gate's
// demonstrability lives HERE in fixtures, never in the table). Two parts:
//
//   PART A (fixture pass/fail, always active): the completeness predicate that C's DB CHECK must
//   implement — a declined/parked row REQUIRES a surface_test naming all FIVE contracts, each with a
//   non-empty verdict AND a one-line reason; a kept/candidate row is exempt. A declined fixture WITHOUT
//   the five-surface record FAILS the gate (RED); one WITH it PASSES (GREEN). This file is the SSOT for
//   the JSON shape C's migration must match — the CONTRACT_KEYS + surfaceTestComplete() below.
//
//   PART B (pending-C live binding, self-completing): the LIVE binding — the CHECK constraint on
//   coverage_gap_candidates — is owned by Session C's forthcoming migration (DECISION 1, operator ruling
//   2026-07-17: C owns the table, Session A does not touch it). This golden SCANS the migrations tree for
//   that migration. Until it lands it prints PENDING-C and PASSES (does not block). THE MOMENT C's
//   migration appears in-tree, this part asserts it carries the disposition column + surface_test + a
//   CHECK referencing all five contract keys — so the wiring completes itself and a wrong/incomplete C
//   migration is caught. That is the "named dependency, not silently unwired" the operator required.
//
// No DB, no network, no spend. Run: node scripts/verify/surface-contract-gate.golden.mjs (exit 0 PASS, 1 FAIL).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// The five surface contracts, canonical JSON keys. C's migration CHECK MUST use exactly these keys;
// this array is the shared SSOT the doctrine + both skills cite.
const CONTRACT_KEYS = ["regulations", "operations", "market_intel", "research", "community"];

// The completeness predicate — the JS mirror of the DB CHECK C will implement. A surface_test is
// complete iff it is an object naming all five contracts, each an object carrying a non-empty verdict
// AND a non-empty reason. (verdict vocabulary in/out/route/revisit is recommended in prose, not
// mechanically constrained beyond non-empty — the gate forces the DECISION to be recorded, not its shape.)
function surfaceTestComplete(st) {
  if (st === null || typeof st !== "object" || Array.isArray(st)) return false;
  return CONTRACT_KEYS.every((k) => {
    const v = st[k];
    return v && typeof v === "object" && !Array.isArray(v)
      && typeof v.verdict === "string" && v.verdict.trim().length > 0
      && typeof v.reason === "string" && v.reason.trim().length > 0;
  });
}

// The gate: disposition 'declined' or 'parked' REQUIRES the complete five-surface record; 'kept' /
// 'candidate' is exempt (a live coverage-gap candidate is not a scope decision, it carries no decline).
function gatePasses(row) {
  if (row.disposition === "declined" || row.disposition === "parked") return surfaceTestComplete(row.surface_test);
  return true;
}

const fiveComplete = () => Object.fromEntries(CONTRACT_KEYS.map((k) => [k, { verdict: "out", reason: `no ${k} fit` }]));

// ───────────────────────── PART A: fixture pass/fail (the gate, proven) ─────────────────────────
console.log("--- PART A: fixture completeness gate ---");

// RED: a declined row WITHOUT the five-surface record must FAIL the gate.
check("declined + no surface_test FAILS the gate (RED)", gatePasses({ disposition: "declined", surface_test: null }) === false);
check("parked + no surface_test FAILS the gate (RED)", gatePasses({ disposition: "parked", surface_test: null }) === false);

// RED: an INCOMPLETE record must FAIL (missing a contract, empty verdict, or missing reason).
const missingOne = fiveComplete(); delete missingOne.community;
check("declined + only four contracts FAILS (RED)", gatePasses({ disposition: "declined", surface_test: missingOne }) === false);
const emptyVerdict = fiveComplete(); emptyVerdict.operations = { verdict: "", reason: "x" };
check("declined + empty verdict FAILS (RED)", gatePasses({ disposition: "declined", surface_test: emptyVerdict }) === false);
const noReason = fiveComplete(); noReason.research = { verdict: "out" };
check("declined + missing reason FAILS (RED)", gatePasses({ disposition: "declined", surface_test: noReason }) === false);
const arrayShape = fiveComplete(); arrayShape.market_intel = ["out", "x"];
check("declined + non-object surface entry FAILS (RED)", gatePasses({ disposition: "declined", surface_test: arrayShape }) === false);

// GREEN: a declined/parked row WITH the complete five-surface record PASSES.
check("declined + complete five-surface record PASSES (GREEN)", gatePasses({ disposition: "declined", surface_test: fiveComplete() }) === true);
check("parked + complete five-surface record PASSES (GREEN)", gatePasses({ disposition: "parked", surface_test: fiveComplete() }) === true);

// EXEMPT: a kept / candidate row carries no decline, so it is not required to hold a surface_test.
check("kept + no surface_test PASSES (exempt — not a scope decision)", gatePasses({ disposition: "kept", surface_test: null }) === true);
check("candidate + no surface_test PASSES (exempt)", gatePasses({ disposition: "candidate", surface_test: null }) === true);

// The five contracts are exactly the ratified five customer surfaces (no sixth, none dropped).
check("CONTRACT_KEYS are exactly the five surfaces", CONTRACT_KEYS.length === 5
  && ["regulations", "operations", "market_intel", "research", "community"].every((k) => CONTRACT_KEYS.includes(k)));

// ───────────────────── PART B: pending-C live binding (self-completing) ─────────────────────
console.log("--- PART B: live DB binding (Session C migration) ---");

const MIG_DIR = resolve(ROOT, "supabase/migrations");
let migFiles = [];
try { migFiles = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")); } catch { /* none */ }

// C's migration is the one that ALTERs coverage_gap_candidates to add surface_test. Detect it by content.
let cMig = null, cSrc = "";
for (const f of migFiles) {
  const src = readFileSync(resolve(MIG_DIR, f), "utf8");
  if (/coverage_gap_candidates/i.test(src) && /surface_test/i.test(src)) { cMig = f; cSrc = src; break; }
}

if (!cMig) {
  // DORMANT / PENDING-C — named, not silently unwired: the invariant is enforced by PART A's fixture
  // proof; the LIVE binding lands when C posts its migration number to the session log and adds the
  // surface_test column. This block auto-arms the moment that migration appears in-tree.
  console.log("PASS  PENDING-C: live DB binding not yet in tree — Session C owns the coverage_gap_candidates");
  console.log("      migration (disposition + surface_test + five-surface CHECK) per operator ruling 2026-07-17.");
  console.log("      This golden will auto-assert it once the migration file lands. Fixtures (PART A) enforce meanwhile.");
} else {
  console.log(`  detected Session C migration: ${cMig}`);
  const code = cSrc.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  check("C migration adds surface_test (jsonb)", /surface_test\s+jsonb/i.test(code));
  check("C migration adds disposition with declined + parked", /disposition/i.test(code) && /declined/i.test(code) && /parked/i.test(code));
  check("C migration CHECK references all five contract keys", CONTRACT_KEYS.every((k) => new RegExp(`['"]${k}['"]`).test(code)));
  check("C migration CHECK requires verdict + reason", /verdict/i.test(code) && /reason/i.test(code));
}

console.log(failed ? `\n${failed} FAIL` : "\nALL PASS (surface-contract-gate)");
process.exit(failed ? 1 : 0);
