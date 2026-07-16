#!/usr/bin/env node
// mint-gates-live-hold.golden.mjs — proves the LIVE mint-gate hold posture (hardening A1 flip, 2026-07-16).
// Source-scan (no DB) of the pipeline wiring + the migration, plus the pure evaluator's hard/soft separation:
//   - S-CONFLATE = HARD hold: the wiring marks the conflated FACTs with mint_hold_reason='S-CONFLATE' and the
//     migration makes validate_item_provenance fail on it (fact_mint_hold) -> item held.
//   - S-NUMERIC = SOFT hold: the wiring writes a data_quality integrity_flag and does NOT set mint_hold_reason
//     -> the item stays verified-eligible (real-but-mis-cited class, routed to live verification).
//   - a FACT still MINTS regardless (the insert is unconditional; the hold is a post-insert mark).
// Invariant RD-41. Run: node scripts/verify/mint-gates-live-hold.golden.mjs — exit 0 PASS, 1 FAIL.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { perFactGates, identityCongruenceHolds } from "../../src/lib/agent/mint-gates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pipe = readFileSync(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"), "utf8");
const mig = readFileSync(resolve(ROOT, "supabase/migrations/206_mint_gate_hold_marker.sql"), "utf8");
let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// Under the non-destructive doctrine (2026-07-16) the mint-gate block runs AFTER the non-destructive apply
// (over the FACTs the ground added/changed = applyRes.touchedFacts pushed into gateFacts), so it sits between
// "MINT-GATE LIVE HOLD" and the "B#2" citation-edges section that follows it.
const s = pipe.indexOf("MINT-GATE LIVE HOLD");
const e = pipe.indexOf("B#2 (Phase 1): write the item->source citation edges");
const block = s >= 0 && e > s ? pipe.slice(s, e) : "";

check("live-hold block exists", block.length > 0);
check("block carries the live log marker", block.includes("[mint-gates:live]"));
// S-CONFLATE HARD: mark mint_hold_reason on the identity-congruence-held facts
check("S-CONFLATE hard-marks mint_hold_reason via identityCongruenceHolds", /identityCongruenceHolds\(gateFacts\)/.test(block) && /mint_hold_reason:\s*"S-CONFLATE"/.test(block));
// S-NUMERIC SOFT: writes an integrity_flag, item stays verified-eligible
check("S-NUMERIC writes a soft integrity_flag (mint_gate_s_numeric)", block.includes("mint_gate_s_numeric") && /integrity_flags"\)\.insert/.test(block));
check("S-NUMERIC does NOT set mint_hold_reason (soft, stays verified-eligible)", !/spanNumeric[\s\S]{0,160}mint_hold_reason/.test(block));
// FACT collection is unconditional (facts mint regardless; the hold is a post-APPLY mark). Under the
// non-destructive doctrine the ground COLLECTS every claim into `incoming` (unconditional), then applyLedgerDiff
// inserts the new/changed rows; the mint-gate mark runs after apply. So: collection is unconditional and NOT
// wrapped in a mint-gate condition, and the apply path is present.
check("FACT collected unconditionally (incoming.push)", /incoming\.push\(\{/.test(pipe));
check("collection is not wrapped in a mint-gate condition", !/if\s*\([^)]*(perFactGates|identityCongruenceHolds)[^)]*\)\s*\{[\s\S]{0,300}incoming\.push\(/.test(pipe));
check("non-destructive apply path present (applyLedgerDiff)", /applyLedgerDiff\(sb,\s*itemId,\s*diffLedger\(/.test(pipe));
check("mint-gate runs over the ground's touched FACTs (post-apply)", /gateFacts\.push\(\.\.\.applyRes\.touchedFacts\)/.test(pipe));
// migration: validate_item_provenance fails on a non-null mint_hold_reason (the hard-hold criterion)
check("migration 206 adds the fact_mint_hold criterion on mint_hold_reason", mig.includes("fact_mint_hold") && /mint_hold_reason IS NOT NULL/.test(mig));
check("migration 206 is non-regressive (new nullable column, idempotent guard)", /ADD COLUMN IF NOT EXISTS mint_hold_reason/.test(mig) && mig.includes("already patched, idempotent"));

// evaluator: hard vs soft separation
const SPAN = "Regulation (EU) 2023/1805 on renewable and low-carbon fuels in maritime transport";
const isoItem = [
  { id: "a", claim_kind: "FACT", claim_text: "Regulation (EU) 2023/1805 mandates ISO 14083 certificates.", source_span: SPAN },
  { id: "b", claim_kind: "FACT", claim_text: "Regulation (EU) 2023/1805 embeds ISO 14083.", source_span: SPAN },
  { id: "c", claim_kind: "FACT", claim_text: "CountEmissions EU (2023/1805) uses ISO 14083.", source_span: SPAN },
];
check("conflated facts -> S-CONFLATE hard hold set", identityCongruenceHolds(isoItem).has("a"));
const numFact = { id: "n", claim_kind: "FACT", claim_text: "the premium is €6,800/tkm", source_span: "45% by 2030", source_id: "s", source_tier_at_grounding: 1 };
check("mis-cited numeric -> spanNumeric SOFT, not an identity hard hold",
  perFactGates(numFact, { itemFloor: 2, suspendedSourceIds: new Set() }).spanNumeric === true && identityCongruenceHolds([numFact]).size === 0);
const cleanFact = { id: "z", claim_kind: "FACT", claim_text: "at least 20% by 2030", source_span: "reduce by at least 20% by 2030", source_id: "s", source_tier_at_grounding: 1 };
const cg = perFactGates(cleanFact, { itemFloor: 2, suspendedSourceIds: new Set() });
check("clean fact mints normally (no gate fires)", !cg.spanNumeric && !cg.authorityFloor && !cg.genericSource && identityCongruenceHolds([cleanFact]).size === 0);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
