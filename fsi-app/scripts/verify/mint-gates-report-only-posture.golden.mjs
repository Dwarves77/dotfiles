#!/usr/bin/env node
// mint-gates-report-only-posture.golden.mjs — proves the canonical-pipeline mint-gate wiring is REPORT-ONLY
// (hardening A1 seams 2+4). Source-scan (no DB): a gate-tripping FACT still mints unchanged and the log carries
// the trip, because the wiring only accumulates + logs — it never gates the insert, never writes, never throws.
// Invariant RD-41. Run: node scripts/verify/mint-gates-report-only-posture.golden.mjs — exit 0 PASS, 1 FAIL.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { perFactGates } from "../../src/lib/agent/mint-gates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = readFileSync(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"), "utf8");
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// isolate the report-only report block
const start = src.indexOf("MINT-GATE REPORT-ONLY report");
const end = src.indexOf("LEDGER DOMINANCE GUARD");
const block = start >= 0 && end > start ? src.slice(start, end) : "";

check("report-only block exists", block.length > 0);
check("block carries the report-only log marker", block.includes("[mint-gates:report-only]"));
check("block performs NO db write (insert/update/delete)", !/\.\s*(insert|update|delete)\s*\(/.test(block));
check("block does NOT throw", !/\bthrow\b/.test(block));
check("block does NOT early-return a failure", !/return\s*\{\s*ok\s*:\s*false/.test(block));
check("block calls the gate evaluators (perFactGates + identityCongruenceHolds)", block.includes("perFactGates") && block.includes("identityCongruenceHolds"));

// the FACT insert is UNCONDITIONAL on the gates: no `if (...perFactGates...) { ...insert... }` wrapper.
check("FACT insert exists in the pipeline", /section_claim_provenance"\)\.insert\(/.test(src));
check("FACT insert is not wrapped in a mint-gate condition",
  !/if\s*\([^)]*(perFactGates|perFactWouldHold|identityCongruenceHolds)[^)]*\)\s*\{[\s\S]{0,400}section_claim_provenance"\)\.insert\(/.test(src));

// the accumulation is additive (a FACT is pushed for the report, regardless of any gate result)
check("minted FACTs are accumulated for the report (additive)", /if\s*\(isFact\)\s*gateFacts\.push\(/.test(src));

// evaluator is advisory: a gate-tripping fact returns booleans, never throws / never signals a block
let threw = false;
try { const r = perFactGates({ claim_kind: "FACT", claim_text: "€6,800", source_span: "x", source_id: null, source_tier_at_grounding: 9 }, { itemFloor: 2, suspendedSourceIds: new Set() }); check("tripping fact yields would-hold booleans (advisory, no block signal)", r.genericSource === true && r.authorityFloor === true && r.spanNumeric === true); } catch { threw = true; }
check("evaluator never throws on a tripping fact", threw === false);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
