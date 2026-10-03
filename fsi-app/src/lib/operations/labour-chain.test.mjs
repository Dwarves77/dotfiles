// Fixture-based proof for labour-chain.ts. No network, no DB credential (lane common contract, R14).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLabourChain,
  extractLabourChainTerms,
  CHAIN_TERM_ORDER,
  NUMERATOR_TERM_ORDER,
} from "./labour-chain.ts";

/** Float-safe equality (IEEE 754 addition of these fixture values is not byte-exact, e.g.
 *  28.5+9.4+1.8+0.9+1.4 lands on 41.99999999999999, not 42). */
function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `expected ${actual} to be close to ${expected}`);
}

function term(valueNumeric, unit, extra = {}) {
  return {
    valueNumeric,
    unit,
    sourceKey: "fixture",
    sourceRef: "fixture-ref",
    originClass: "official",
    derivation: "observed",
    referencePeriod: "2026-Q3",
    asAtDate: "2026-09-01",
    ...extra,
  };
}

const FULL_CHAIN_INPUT = {
  baseWage: term(28.5, "EUR/hour"),
  employerContributions: term(9.4, "EUR/hour"),
  leaveAbsence: term(1.8, "EUR/hour"),
  turnoverRecruitment: term(0.9, "EUR/hour"),
  shiftPremium: term(1.4, "EUR/hour"),
  productiveHours: term(1650, "hours/year"),
};

test("all five terms present: the chain computes a running subtotal per term and a final per-hour figure", () => {
  const r = computeLabourChain(FULL_CHAIN_INPUT);
  assert.equal(r.suppressed, false);
  assert.deepEqual(r.missingTerms, []);
  // Hand-computed check value: 28.5 + 9.4 + 1.8 + 0.9 + 1.4 = 42.0
  assertClose(r.numeratorTotal, 42.0);
  assert.equal(r.currencyUnit, "EUR");
  // 42.0 / 1650 = 0.025454...
  assertClose(r.finalValue, 42.0 / 1650);
  assert.equal(r.finalUnit, "EUR per productive hour");
  assert.equal(r.gapReason, null);

  // Running subtotal is cumulative across the five numerator terms, in declared order.
  const subtotals = r.terms.filter((t) => NUMERATOR_TERM_ORDER.includes(t.key)).map((t) => t.runningSubtotal);
  const expectedSubtotals = [28.5, 37.9, 39.7, 40.6, 42.0];
  subtotals.forEach((v, i) => assertClose(v, expectedSubtotals[i]));

  // Term order matches the declared chain order, divisor last.
  assert.deepEqual(r.terms.map((t) => t.key), CHAIN_TERM_ORDER);
});

test("one numerator term missing: the chain suppresses (no finalValue), names the gap, and does not silently zero-fill", () => {
  const input = { ...FULL_CHAIN_INPUT, leaveAbsence: null };
  const r = computeLabourChain(input);
  assert.equal(r.suppressed, true);
  assert.deepEqual(r.missingTerms, ["leaveAbsence"]);
  assert.equal(r.numeratorTotal, null, "a missing term must not produce a partial total");
  assert.equal(r.finalValue, null);
  assert.equal(r.finalUnit, null);
  assert.equal(r.gapReason, "missing: Leave and absence");

  const leaveTerm = r.terms.find((t) => t.key === "leaveAbsence");
  assert.equal(leaveTerm.present, false);
  assert.equal(leaveTerm.value, null);

  // Subtotal before the gap is real; every term AT OR AFTER the gap carries no subtotal.
  const baseWage = r.terms.find((t) => t.key === "baseWage");
  assert.equal(baseWage.runningSubtotal, 28.5);
  const turnover = r.terms.find((t) => t.key === "turnoverRecruitment");
  assert.equal(turnover.runningSubtotal, null);
});

test("productive hours missing: the chain suppresses with a named gap, never a divide-by-zero", () => {
  const input = { ...FULL_CHAIN_INPUT, productiveHours: null };
  const r = computeLabourChain(input);
  assert.equal(r.suppressed, true);
  assert.deepEqual(r.missingTerms, ["productiveHours"]);
  // The numerator itself is fine; it is the divide step that is suppressed.
  assertClose(r.numeratorTotal, 42.0);
  assert.equal(r.finalValue, null);
  assert.equal(r.gapReason, "missing: Productive hours");
});

test("productive hours zero: treated as the same honest gap as missing, never a crash or Infinity", () => {
  const input = { ...FULL_CHAIN_INPUT, productiveHours: term(0, "hours/year") };
  const r = computeLabourChain(input);
  assert.equal(r.suppressed, true);
  assert.deepEqual(r.missingTerms, ["productiveHours"]);
  assert.equal(r.finalValue, null, "finalValue is null, never Infinity");
});

test("productive hours negative: also a gap, never a negative per-hour figure", () => {
  const input = { ...FULL_CHAIN_INPUT, productiveHours: term(-10, "hours/year") };
  const r = computeLabourChain(input);
  assert.equal(r.suppressed, true);
  assert.equal(r.finalValue, null);
});

test("every term missing: every term is named in the gap reason, in declared order", () => {
  const r = computeLabourChain({});
  assert.equal(r.suppressed, true);
  assert.deepEqual(
    r.missingTerms,
    ["baseWage", "employerContributions", "leaveAbsence", "turnoverRecruitment", "shiftPremium", "productiveHours"]
  );
  assert.equal(r.currencyUnit, null, "no baseWage means no currency can be read off it");
});

// ── extractLabourChainTerms ─────────────────────────────────────────────────────────────────────

test("extractLabourChainTerms matches facts by label, generically, not by one producer's literal string", () => {
  const facts = [
    { factLabel: "Median hourly wage (BLS OEWS)", valueNumeric: 24.1, unit: "USD/hour" },
    { factLabel: "Employer non-wage social contribution rate", valueNumeric: 7.2, unit: "USD/hour" },
    { factLabel: "Something unrelated entirely", valueNumeric: 999, unit: "USD/hour" },
  ];
  const input = extractLabourChainTerms(facts);
  assert.equal(input.baseWage.valueNumeric, 24.1);
  assert.equal(input.employerContributions.valueNumeric, 7.2);
  assert.equal(input.leaveAbsence, undefined, "no matching fact means the term is simply absent");
  assert.equal(input.shiftPremium, undefined);
});

test("extractLabourChainTerms against a fixture with only a base-wage fact (today's live shape per the coordinator's counts) yields exactly one term", () => {
  const facts = [{ factLabel: "Median hourly wage", valueNumeric: 30, unit: "EUR/hour" }];
  const input = extractLabourChainTerms(facts);
  const r = computeLabourChain(input);
  assert.equal(r.terms.find((t) => t.key === "baseWage").present, true);
  assert.equal(r.suppressed, true);
  assert.equal(r.missingTerms.length, 5);
});

test("extractLabourChainTerms ignores a matching label with no numeric value (an un-enveloped legacy row)", () => {
  const facts = [{ factLabel: "Median hourly wage", valueNumeric: null, unit: "EUR/hour" }];
  const input = extractLabourChainTerms(facts);
  assert.equal(input.baseWage, undefined);
});
