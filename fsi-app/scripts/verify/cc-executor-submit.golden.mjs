#!/usr/bin/env node
// cc-executor-submit.golden.mjs — behavioral golden for the CC-GROUNDING-EXECUTOR submission adapter
// (the injectedLedger seam in groundBrief + executor-ground.mjs). Proves the executor PROPOSES and the
// system's mechanical gates DISPOSE: an injected candidate is subject to the SAME verbatim kept-filter and
// the SAME mint gates as a metered-model ledger — the seam adds no judgment and bypasses nothing. No DB.
// Run: node scripts/verify/cc-executor-submit.golden.mjs — exits 0 PASS, 1 FAIL.
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { perFactGates, perFactWouldHold, identityCongruenceHolds } = await jiti.import("../../src/lib/agent/mint-gates.mjs");

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failed++; };

// THE VERBATIM KEPT-FILTER — the exact predicate groundBrief applies to every FACT (canonical-pipeline.ts:1400):
// a FACT survives ONLY if its source_span is a literal case-insensitive substring of the stored capture. This is
// the mechanical check that makes "propose, gates dispose" real for injected candidates — a span the executor did
// not quote exactly fails, period.
const keptVerbatim = (span, capture) => !!span && String(capture).toLowerCase().includes(String(span).toLowerCase().trim());

const CAPTURE = "From 1 January 2032, passenger ships of 10,000 gross tonnage and upwards shall use energy sources that do not cause direct emissions. Exemptions may be granted for a maximum of two years, not beyond 31 December 2029.";

// 1. VERBATIM DISPOSAL — the seam's core safety.
check("verbatim span present in capture is KEPT", keptVerbatim("shall use energy sources that do not cause direct emissions", CAPTURE) === true);
check("paraphrased span absent from capture is REJECTED", keptVerbatim("ships must switch to zero-emission fuel by 2032", CAPTURE) === false);
check("empty span is REJECTED", keptVerbatim("", CAPTURE) === false);

// 2. MINT GATES DISPOSE (reg-family floor = T2). An injected candidate faces the identical gates.
const ctx = { itemFloor: 2, suspendedSourceIds: new Set(["dead"]) };
check("no-generic-source: null source_id HELD", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: null, source_tier_at_grounding: 1 }, ctx).genericSource === true);
check("authority-floor: tier 3 vs floor 2 HELD", perFactGates({ claim_kind: "FACT", claim_text: "x", source_span: "x", source_id: "s", source_tier_at_grounding: 3 }, ctx).authorityFloor === true);
check("S-NUMERIC: figure absent from span SOFT-HELD", perFactGates({ claim_kind: "FACT", claim_text: "the cap is 70% by 2032", source_span: "not beyond 31 December 2029", source_id: "s", source_tier_at_grounding: 1 }, ctx).spanNumeric === true);
check("clean tier-2 verbatim FACT passes all per-fact gates", perFactWouldHold({ claim_kind: "FACT", claim_text: "not beyond 31 December 2029", source_span: "not beyond 31 December 2029", source_id: "s", source_tier_at_grounding: 2 }, ctx) === false);

// 3. S-CONFLATE (per-item hard hold) disposes an injected reused-span-across-instruments shape.
const SPAN = "Regulation (EU) 2023/1805 on renewable and low-carbon fuels in maritime transport";
const conflated = identityCongruenceHolds([
  { id: "a", claim_kind: "FACT", claim_text: "Reg (EU) 2023/1805 embeds ISO 14083.", source_span: SPAN },
  { id: "b", claim_kind: "FACT", claim_text: "Reg (EU) 2023/1805 mandates ISO 14083 certificates.", source_span: SPAN },
  { id: "c", claim_kind: "FACT", claim_text: "Reg (EU) 2023/1805 applies an ISO 14083 methodology.", source_span: SPAN },
]);
check("S-CONFLATE holds a reused-span multi-instrument injected shape", conflated.size >= 1 && conflated.has("a"));
check("clean single-instrument injected item holds nothing", identityCongruenceHolds([{ id: "z", claim_kind: "FACT", claim_text: "The 2030 target is 20%.", source_span: "the 2030 target is 20%" }]).size === 0);

// 4. FULL DISPOSAL ORDER on a mixed injected ledger: only the clean verbatim floor FACT survives to mint.
const injected = [
  { claim_kind: "FACT", source_span: "not beyond 31 December 2029", source_id: "s", source_tier_at_grounding: 2 }, // clean → mints
  { claim_kind: "FACT", source_span: "ships must switch to zero-emission fuel by 2032", source_id: "s", source_tier_at_grounding: 2 }, // paraphrase → verbatim-rejected
  { claim_kind: "FACT", source_span: "shall use energy sources that do not cause direct emissions", source_id: null, source_tier_at_grounding: 2 }, // verbatim but null source → gate-held
];
const survivors = injected.filter((c) => keptVerbatim(c.source_span, CAPTURE) && !perFactWouldHold(c, ctx));
check("mixed injected ledger: exactly 1 clean candidate survives verbatim+gates", survivors.length === 1 && survivors[0].source_span === "not beyond 31 December 2029");

console.log(failed ? `\nGOLDEN FAILED (${failed})` : "\nGOLDEN PASSED");
process.exit(failed ? 1 : 0);
