#!/usr/bin/env node
// mint-gates.golden.mjs — behavioral golden for the mint-time gate evaluator (hardening A1, seams 2+4).
// No DB. Locks the four gates' would-have-held logic that the report-only calibration + report-only pipeline
// wiring share. Invariant RD-41. Run: node scripts/verify/mint-gates.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { perFactGates, perFactWouldHold, identityCongruenceHolds } = await jiti.import("../../src/lib/agent/mint-gates.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

const SUSP = new Set(["dead-eurlex"]);
const ctx = { itemFloor: 2, suspendedSourceIds: SUSP }; // reg-family floor = T2

// genericSource: null source, suspended source, active source
check("genericSource: null source_id holds", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: null, source_tier_at_grounding: 1 }, ctx).genericSource === true);
check("genericSource: suspended source holds", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "dead-eurlex", source_tier_at_grounding: 1 }, ctx).genericSource === true);
check("genericSource: active specific source clean", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "real-1", source_tier_at_grounding: 1 }, ctx).genericSource === false);

// authorityFloor: tier below floor (3 > 2) holds; at/above floor clean
check("authorityFloor: tier 3 vs floor 2 holds", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "s", source_tier_at_grounding: 3 }, ctx).authorityFloor === true);
check("authorityFloor: tier 2 vs floor 2 clean", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "s", source_tier_at_grounding: 2 }, ctx).authorityFloor === false);
check("authorityFloor: null floor (exempt type) clean", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "s", source_tier_at_grounding: 6 }, { itemFloor: null, suspendedSourceIds: SUSP }).authorityFloor === false);

// spanNumeric: figure absent from span holds; present clean
check("spanNumeric: euro 6,800 absent from span holds", perFactGates({ claim_kind: "FACT", claim_text: "the premium is €6,800/tkm", source_span: "45% by 2030", source_id: "s", source_tier_at_grounding: 1 }, ctx).spanNumeric === true);
check("spanNumeric: figure present in span clean", perFactGates({ claim_kind: "FACT", claim_text: "at least 20% by 2030", source_span: "reduce by at least 20% by 2030", source_id: "s", source_tier_at_grounding: 1 }, ctx).spanNumeric === false);

// non-FACT returns null (gates apply to FACTs only)
check("non-FACT returns null", perFactGates({ claim_kind: "ANALYSIS", claim_text: "x", source_span: "x", source_id: null }, ctx) === null);

// perFactWouldHold: any gate true -> hold
check("perFactWouldHold true when a gate fires", perFactWouldHold({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: null, source_tier_at_grounding: 1 }, ctx) === true);
check("perFactWouldHold false when all clean", perFactWouldHold({ claim_kind: "FACT", claim_text: "20% by 2030", source_span: "20% by 2030", source_id: "real-1", source_tier_at_grounding: 1 }, ctx) === false);

// identity-congruence (S-CONFLATE, per item): the ISO 14083 shape holds the reused-span facts
const SPAN = "Regulation (EU) 2023/1805 on renewable and low-carbon fuels in maritime transport";
const isoItem = [
  { id: "a", claim_kind: "FACT", claim_text: "CountEmissions EU (Regulation (EU) 2023/1805) embeds ISO 14083.", source_span: SPAN },
  { id: "b", claim_kind: "FACT", claim_text: "Regulation (EU) 2023/1805 mandates ISO 14083 certificates.", source_span: SPAN },
  { id: "c", claim_kind: "FACT", claim_text: "Regulation (EU) 2023/1805 applies an ISO 14083 methodology.", source_span: SPAN },
];
const held = identityCongruenceHolds(isoItem);
check("identityCongruence: ISO 14083 shape holds its facts", held.size >= 1 && held.has("a"));
check("identityCongruence: a clean single-instrument item holds nothing", identityCongruenceHolds([{ id: "z", claim_kind: "FACT", claim_text: "The 2030 target is 20%.", source_span: "the 2030 target is 20%" }]).size === 0);

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
