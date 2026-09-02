// Proof for src/lib/market/signal-promotion.mjs (Lane SURF: spec 02 §2/§6 item 4, and the named §9
// defect `isSignalType = !!r.type`, always true). Covers every PROMOTION_STATE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROMOTION_STATE, derivePromotionState } from "../lib/market/signal-promotion.mjs";

// ── the defect this module replaces: the old check was ALWAYS true ─────────────────────────────────────

test("with no evidence at all, the state is 'unclassified' — never the always-true old isSignalType check", () => {
  const s = derivePromotionState({});
  assert.equal(s.code, PROMOTION_STATE.unclassified.code);
  assert.equal(s.basis, "none");
});

test("derivePromotionState() with no argument at all defaults to unclassified, never throws", () => {
  const s = derivePromotionState();
  assert.equal(s.code, "unclassified");
});

// ── origin_class present (forward-compatible path; not live on any row yet) ────────────────────────────

test("origin_class 'official' promotes straight to FACT regardless of corroboration count", () => {
  const s = derivePromotionState({ originClass: "official", independentCiters: null });
  assert.equal(s.code, "fact");
  assert.equal(s.basis, "origin_class");
});

test("origin_class 'verified' promotes to FACT", () => {
  const s = derivePromotionState({ originClass: "verified" });
  assert.equal(s.code, "fact");
});

test("origin_class 'partner' promotes to FACT (citable-as-fact per the shared vocabulary)", () => {
  const s = derivePromotionState({ originClass: "partner" });
  assert.equal(s.code, "fact");
});

test("origin_class 'modelled' is NOT citable as fact — stays a signal even though origin_class is present", () => {
  const s = derivePromotionState({ originClass: "modelled", independentCiters: null });
  assert.equal(s.code, "signal_unconfirmed");
  assert.equal(s.basis, "origin_class");
});

test("origin_class 'community' with 3 independent citers is SIGNAL — corroborated, never FACT", () => {
  const s = derivePromotionState({ originClass: "community", independentCiters: 3 });
  assert.equal(s.code, "signal_corroborated");
  assert.equal(s.basis, "origin_class+corroboration");
  assert.notEqual(s.code, "fact", "corroboration count alone must never promote to fact");
});

test("an unrecognised origin_class code is treated as a signal, never silently ignored or promoted", () => {
  const s = derivePromotionState({ originClass: "not-a-real-code", independentCiters: 5 });
  assert.equal(s.code, "signal_corroborated");
  assert.notEqual(s.code, "fact");
});

// ── origin_class absent (today's live reality for every intelligence_items row) ────────────────────────

test("origin_class absent + independentCiters >= 2 -> SIGNAL, corroborated (never FACT: no primary-source evidence)", () => {
  const s = derivePromotionState({ independentCiters: 2 });
  assert.equal(s.code, "signal_corroborated");
  assert.equal(s.basis, "corroboration");
  assert.equal(s.originClass, null);
});

test("origin_class absent + independentCiters === 1 -> SIGNAL, unconfirmed (below the corroboration floor)", () => {
  const s = derivePromotionState({ independentCiters: 1 });
  assert.equal(s.code, "signal_unconfirmed");
  assert.equal(s.basis, "corroboration");
});

test("independentCiters === 0 is treated as no evidence (not coerced into a corroborated signal)", () => {
  const s = derivePromotionState({ independentCiters: 0 });
  assert.equal(s.code, "unclassified");
});

test("a negative or non-numeric independentCiters is treated as no evidence, never throws or fabricates", () => {
  assert.equal(derivePromotionState({ independentCiters: -3 }).code, "unclassified");
  assert.equal(derivePromotionState({ independentCiters: "5" }).code, "unclassified");
  assert.equal(derivePromotionState({ independentCiters: NaN }).code, "unclassified");
});

// ── every PROMOTION_STATE is reachable and carries a distinct chip label ───────────────────────────────

test("all four promotion states are distinct codes with a chip label", () => {
  const codes = Object.values(PROMOTION_STATE).map((s) => s.code);
  assert.deepEqual(new Set(codes).size, codes.length, "codes must be unique");
  for (const s of Object.values(PROMOTION_STATE)) {
    assert.ok(s.chip && s.chip.length > 0);
  }
});

test("PROMOTION_STATE.fact's chip never says 'Unverified' (the exact inversion spec 02 §9 names)", () => {
  assert.ok(!PROMOTION_STATE.fact.chip.toLowerCase().includes("unverified"));
});
