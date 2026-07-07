// @ts-check
// RED-THEN-GREEN fixtures for the BATCH-1 orchestration core. All side effects (seek-more fetch, pool persist,
// ground, validate, exhaustion persist, ticket, cost) are DEP-INJECTED fakes — NO real fetch, NO db write, NO
// spend (scrape hold honored). Run: node --test scripts/lib/batch1-orchestrate.test.mjs. Registered in
// .discipline/run-test-suite.sh. Imports only node: builtins + this relative .mjs (glob-portability-clean).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectBatchClass, isBatch1Item, classifyOutcome, processItem, estimateItemEnvelope, NONREG_FLOORED,
} from "./batch1-orchestrate.mjs";

// ── BATCH SELECTION (mirrors the flip-projection split) ───────────────────────────────────────────────────────
test("selectBatchClass: missing_required_slot reg → retrieval (a new source can cover the slot)", () => {
  assert.equal(selectBatchClass({ reasons: ["missing_required_slot"], itemType: "regulation" }), "retrieval");
});

test("selectBatchClass: below-floor on a non-reg floored type → structural (resolver-excluded)", () => {
  for (const t of NONREG_FLOORED)
    assert.equal(selectBatchClass({ reasons: ["fact_below_authority_floor"], itemType: t }), "structural");
  // below-floor on a REGULATION is NOT structural — a higher-tier primary can exist → retrieval.
  assert.equal(selectBatchClass({ reasons: ["fact_below_authority_floor"], itemType: "regulation" }), "retrieval");
});

test("selectBatchClass: relabel-only hold → structural (4c-relabel lever, not a paid fetch)", () => {
  assert.equal(selectBatchClass({ reasons: ["unlabeled_assertion"], itemType: "regulation" }), "structural");
  assert.equal(selectBatchClass({ reasons: ["unlabeled_assertion", "analysis_missing_label_syntax"], itemType: "research_finding" }), "structural");
  // below-floor on a non-reg type BUT ALSO missing a slot → retrieval (the slot is coverable by a new source).
  assert.equal(selectBatchClass({ reasons: ["fact_below_authority_floor", "missing_required_slot"], itemType: "technology" }), "retrieval");
});

test("isBatch1Item: verified items are never selected", () => {
  assert.equal(isBatch1Item({ valid: true, reasons: [], itemType: "regulation" }), false);
  assert.equal(isBatch1Item({ valid: false, reasons: ["missing_required_slot"], itemType: "regulation" }), true);
  assert.equal(isBatch1Item({ valid: false, reasons: ["unlabeled_assertion"], itemType: "regulation" }), false);
});

// ── OUTCOME CLASSIFICATION ────────────────────────────────────────────────────────────────────────────────────
test("classifyOutcome: the 3-way split", () => {
  assert.equal(classifyOutcome({ outcome: "no_reachable_source", hasCaptured: false }, false), "NO_REACHABLE_SOURCE");
  assert.equal(classifyOutcome({ outcome: "seek_more", hasCaptured: false }, false), "NO_REACHABLE_SOURCE");
  assert.equal(classifyOutcome({ outcome: "content", hasCaptured: true }, true), "FLIPPED");
  assert.equal(classifyOutcome({ outcome: "content", hasCaptured: true }, false), "HELD");
});

// ── processItem: the per-item decision pipeline (fakes) ───────────────────────────────────────────────────────
/** Build a deps harness recording the calls, with configurable seek + post-ground validity. */
function harness({ beforeValid = false, seek, afterValid = false, cost = 0.4 }) {
  const calls = { setTicket: 0, persistCaptured: [], ground: 0, persistExhaustion: [], validate: 0 };
  let grounded = false;
  const deps = {
    validate: async () => { calls.validate++; return grounded ? { valid: afterValid, reasons: afterValid ? [] : ["missing_required_slot"] } : { valid: beforeValid, reasons: beforeValid ? [] : ["missing_required_slot"] }; },
    setTicket: () => { calls.setTicket++; },
    seekMore: async () => seek,
    persistCaptured: async (id, cap) => { calls.persistCaptured.push({ id, cap }); },
    ground: async () => { calls.ground++; grounded = true; return { ok: true, slotForcing: { factsForced: 1 } }; },
    persistExhaustion: async (id, rec, verdict) => { calls.persistExhaustion.push({ id, rec, verdict }); },
    itemCost: () => cost,
    breakerTripped: (c) => ({ tripped: c >= 3.0, reason: "" }),
  };
  return { deps, calls };
}

const ITEM = { id: "aaa-1", key: "aaa-1", title: "Some Reg", identifier: "32022L2464", jurisdiction: "EU", source_url: "https://x", itemType: "regulation" };

test("processItem GREEN (FLIPPED): content captured → pool persist → ground → verified", async () => {
  const seek = { captured: { url: "https://eur-lex.europa.eu/...", text: "real law " + "x".repeat(3000) }, exhaustionRecord: [{ url: "u", transport: "direct", verdict: "content" }], outcome: "content", holdReason: null, candidates: ["c1"] };
  const { deps, calls } = harness({ seek, afterValid: true });
  const r = await processItem(ITEM, deps);
  assert.equal(r.outcome, "FLIPPED");
  assert.equal(r.valid, true);
  assert.equal(calls.persistCaptured.length, 1, "new source written into the pool");
  assert.equal(calls.ground, 1, "re-ground ran over the updated pool");
  assert.equal(calls.persistExhaustion.length, 1, "exhaustion record persisted");
});

test("processItem (HELD): content captured but ground does not satisfy the floor → honest quarantine", async () => {
  const seek = { captured: { url: "https://news/...", text: "secondary " + "x".repeat(3000) }, exhaustionRecord: [{ url: "u", transport: "render", verdict: "content" }], outcome: "content", holdReason: null, candidates: ["c1"] };
  const { deps, calls } = harness({ seek, afterValid: false });
  const r = await processItem(ITEM, deps);
  assert.equal(r.outcome, "HELD");
  assert.equal(r.valid, false);
  assert.equal(calls.ground, 1);
  assert.deepEqual(r.after, ["missing_required_slot"]);
});

test("processItem (NO_REACHABLE_SOURCE): all candidates exhausted → hold, NO ground, NO pool write", async () => {
  const seek = { captured: null, exhaustionRecord: [{ url: "u1", transport: "direct", verdict: "block" }, { url: "u1", transport: "render", verdict: "block" }], outcome: "no_reachable_source", holdReason: "NO_REACHABLE_SOURCE", candidates: ["u1"] };
  const { deps, calls } = harness({ seek });
  const r = await processItem(ITEM, deps);
  assert.equal(r.outcome, "NO_REACHABLE_SOURCE");
  assert.equal(r.holdReason, "NO_REACHABLE_SOURCE");
  assert.equal(calls.ground, 0, "never pays to ground when no source was reached");
  assert.equal(calls.persistCaptured.length, 0, "no junk enters the pool");
  assert.equal(calls.persistExhaustion.length, 1, "exhaustion record still persisted (the honest proof)");
  assert.equal(r.attempts, 2);
});

test("processItem skips an already-verified item (no ticket, no fetch, no spend — necessity gate)", async () => {
  const seek = { captured: { url: "u", text: "x".repeat(3000) }, exhaustionRecord: [], outcome: "content", holdReason: null, candidates: [] };
  const { deps, calls } = harness({ beforeValid: true, seek });
  const r = await processItem(ITEM, deps);
  assert.equal(r.outcome, "ALREADY_VERIFIED");
  assert.equal(calls.setTicket, 0);
  assert.equal(calls.ground, 0);
  assert.equal(calls.persistExhaustion.length, 0);
});

// ── ENVELOPE ESTIMATE ─────────────────────────────────────────────────────────────────────────────────────────
// A tiny deterministic cost model (mirrors costUsdForModel's shape: per-token in/out) so the estimate math is
// asserted without importing the TS config.
const fakeCost = (model, inTok, outTok) => (model.includes("haiku") ? inTok * 1e-6 + outTok * 4e-6 : inTok * 3e-6 + outTok * 15e-6);

test("estimateItemEnvelope: web_search head fires only without a deterministic candidate; units counted", () => {
  const withDet = estimateItemEnvelope({ poolChars: 40000, nSlots: 6, hasDeterministicCandidate: true }, { K: 3, costUsdForModel: fakeCost });
  const noDet = estimateItemEnvelope({ poolChars: 40000, nSlots: 6, hasDeterministicCandidate: false }, { K: 3, costUsdForModel: fakeCost });
  assert.equal(withDet.searchUsd, 0, "deterministic candidate → no paid search");
  assert.ok(noDet.searchUsd > 0, "no deterministic candidate → the open-web fallback is priced in");
  assert.ok(noDet.usd > withDet.usd);
  assert.equal(withDet.browserlessUnits, 3);
  assert.ok(withDet.groundUsd > 0 && withDet.judgeUsd > 0);
});

test("estimateItemEnvelope: pool chars are capped at 560k (matches the ground-call clamp)", () => {
  const huge = estimateItemEnvelope({ poolChars: 5_000_000, nSlots: 0, hasDeterministicCandidate: true }, { K: 3, costUsdForModel: fakeCost });
  const cap = estimateItemEnvelope({ poolChars: 560000, nSlots: 0, hasDeterministicCandidate: true }, { K: 3, costUsdForModel: fakeCost });
  assert.equal(huge.groundUsd, cap.groundUsd);
});
