// @ts-check
// GOLDEN: the ledger dominance guard (re-grounds-never-destroy). Red fixture = Brazil Lei 12.305 (55 FACT ->
// 2 GAP): the count-only guard was blind to it (section-cascade zeroed the prior snapshot; and 55-of-any-kind
// preserved the total). The dominance rule catches it on the facts + floor-qualifying axes. Also preserves the
// legacy thinning cases (the 24 -> 1 batch-1 regression) so no coverage is lost by superseding thinning-guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeLedger, ledgerRegression, isThinningRegression, FACT_FLOOR, THINNING_FLOOR } from "./ledger-dominance.mjs";

// ── summarizeLedger ─────────────────────────────────────────────────────────────────────────────────────────
test("summarizeLedger counts facts and floor-qualifying facts against the item floor", () => {
  const claims = [
    { claim_kind: "FACT", source_tier_at_grounding: 1 },   // floor-qualifying (<=2)
    { claim_kind: "FACT", source_tier_at_grounding: 2 },   // floor-qualifying
    { claim_kind: "FACT", source_tier_at_grounding: 5 },   // FACT but sub-floor
    { claim_kind: "FACT", source_tier_at_grounding: null }, // FACT, unregistered host (null tier)
    { claim_kind: "GAP" },
    { claim_kind: "ANALYSIS", source_tier_at_grounding: 3 },
  ];
  const s = summarizeLedger(claims, 2); // reg-family floor = 2
  assert.deepEqual(s, { total: 6, facts: 4, floorQualifying: 2 });
});

test("summarizeLedger: floor-EXEMPT item type (itemFloor null) -> floorQualifying 0, facts still counted", () => {
  const s = summarizeLedger([{ claim_kind: "FACT", source_tier_at_grounding: 5 }, { claim_kind: "GAP" }], null);
  assert.deepEqual(s, { total: 2, facts: 1, floorQualifying: 0 });
});

// ── THE RED GOLDEN: Brazil Lei 12.305/2010 ──────────────────────────────────────────────────────────────────
test("RED GOLDEN (Brazil): 55 FACT / floor-qualifying -> 2 GAP is a regression on facts + floor + total", () => {
  const prior = { total: 55, facts: 55, floorQualifying: 40 };
  const next = { total: 2, facts: 0, floorQualifying: 0 };
  const r = ledgerRegression(prior, next);
  assert.equal(r.regression, true);
  assert.deepEqual(r.axes.sort(), ["facts", "floor_qualifying", "total"]);
});

test("RED GOLDEN (the count-blind case): 55 FACT -> 55 GAP (total preserved, facts destroyed) IS a regression", () => {
  // This is exactly what the count-only guard MISSED: total 55 -> 55 (no collapse), but facts 55 -> 0.
  const r = ledgerRegression({ total: 55, facts: 55, floorQualifying: 40 }, { total: 55, facts: 0, floorQualifying: 0 });
  assert.equal(r.regression, true);
  assert.ok(r.axes.includes("facts"));
  assert.ok(r.axes.includes("floor_qualifying"));
  assert.equal(r.axes.includes("total"), false); // the total axis alone would NOT have caught it
});

// ── legitimate re-grounds must NOT trip (a worse-answer guard that false-trips would freeze real improvement) ─
test("PASS: a legitimate trim that keeps most facts is NOT a regression", () => {
  assert.equal(ledgerRegression({ total: 24, facts: 24, floorQualifying: 20 }, { total: 22, facts: 21, floorQualifying: 18 }).regression, false);
  assert.equal(ledgerRegression({ total: 65, facts: 60, floorQualifying: 40 }, { total: 50, facts: 45, floorQualifying: 35 }).regression, false);
});

test("PASS: a re-ground that IMPROVES floor-qualifying (the reattribution win) is not a regression", () => {
  // EU Weights & Dimensions shape: same facts, MORE grounded at the floor (5-below -> 0-below).
  assert.equal(ledgerRegression({ total: 41, facts: 41, floorQualifying: 36 }, { total: 35, facts: 35, floorQualifying: 35 }).regression, false);
});

test("EXEMPT: tiny prior grounding is not guarded (a 3 -> 1 fact drop is noise)", () => {
  assert.equal(FACT_FLOOR, 4);
  assert.equal(ledgerRegression({ total: 3, facts: 3, floorQualifying: 1 }, { total: 1, facts: 0, floorQualifying: 0 }).regression, false);
  // floor_qualifying axis: guarded only when the prior HAD floor grounding; 1 -> 0 with facts also collapsing
  // from a tiny prior stays exempt because facts prior < FACT_FLOOR and total prior < FACT_FLOOR.
});

test("floor_qualifying axis fires independently: facts held but ALL floor grounding lost", () => {
  // Facts unchanged (no facts-axis trip) but every fact fell below the floor -> lost all floor-grounded facts.
  const r = ledgerRegression({ total: 30, facts: 30, floorQualifying: 12 }, { total: 30, facts: 30, floorQualifying: 0 });
  assert.equal(r.regression, true);
  assert.deepEqual(r.axes, ["floor_qualifying"]);
});

test("verified_eligibility axis: prior would verify, candidate would not", () => {
  const r = ledgerRegression(
    { total: 20, facts: 20, floorQualifying: 18, wouldVerify: true },
    { total: 20, facts: 20, floorQualifying: 18, wouldVerify: false },
  );
  assert.equal(r.regression, true);
  assert.deepEqual(r.axes, ["verified_eligibility"]);
});

// ── legacy thinning-guard cases preserved (superseded module keeps the same catches) ────────────────────────
test("LEGACY preserved: isThinningRegression still catches the batch-1 24 -> 1 collapse", () => {
  assert.equal(THINNING_FLOOR, 4);
  assert.equal(isThinningRegression(24, 1), true);
  assert.equal(isThinningRegression(24, 0), true);
  assert.equal(isThinningRegression(30, 5), true);
  assert.equal(isThinningRegression(24, 20), false);
  assert.equal(isThinningRegression(24, 12), false); // exactly half — allowed (threshold is BELOW half)
  assert.equal(isThinningRegression(3, 1), false);   // tiny prior exempt
  assert.equal(isThinningRegression(4, 1), true);    // at the floor with a collapse IS guarded
});
