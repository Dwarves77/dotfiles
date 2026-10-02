import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAssumptionInput, isAtRisk, ASSUMPTION_STATUSES } from "./contract.mjs";

const VALID = {
  name: "Frankfurt-Milan express road linehaul stays diesel-costed through 2030",
  valueNumeric: 34,
  unit: "% of quoted margin",
  boundTo: "34% of quoted margin on EU road",
  loadBearing: true,
  vulnerable: true,
  reviewDate: "2026-12-01",
  sourceNote: "Contract renewal cycle, EU road tender Q4.",
};

test("a fully-formed input validates and normalizes cleanly", () => {
  const result = validateAssumptionInput(VALID);
  assert.equal(result.valid, true);
  assert.equal(result.value.name, VALID.name);
  assert.equal(result.value.valueNumeric, 34);
  assert.equal(result.value.unit, "% of quoted margin");
  assert.equal(result.value.status, "active");
});

test("name is required", () => {
  const result = validateAssumptionInput({ ...VALID, name: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("name is required")));
});

test("name is trimmed before the required check, not just checked raw", () => {
  const result = validateAssumptionInput({ ...VALID, name: "   " });
  assert.equal(result.valid, false);
});

test("boundTo is required: this is what makes a card an assumption, not just a fact", () => {
  const result = validateAssumptionInput({ ...VALID, boundTo: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("boundTo is required")));
});

test("loadBearing and vulnerable must both be explicit booleans, never inferred", () => {
  const result = validateAssumptionInput({ ...VALID, loadBearing: undefined, vulnerable: "yes" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("loadBearing")));
  assert.ok(result.errors.some((e) => e.includes("vulnerable")));
});

test("reviewDate is required and must be ISO YYYY-MM-DD", () => {
  assert.equal(validateAssumptionInput({ ...VALID, reviewDate: "" }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, reviewDate: "12/01/2026" }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, reviewDate: "2026-13-40" }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, reviewDate: "2026-12-01" }).valid, true);
});

test("a populated valueNumeric requires a unit (a malformed envelope, not a valid one)", () => {
  const result = validateAssumptionInput({ ...VALID, unit: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("unit is required")));
});

test("valueNumeric and unit are both optional when the assumption carries no bare number", () => {
  const { valueNumeric: _valueNumeric, unit: _unit, ...rest } = VALID;
  const result = validateAssumptionInput(rest);
  assert.equal(result.valid, true);
  assert.equal(result.value.valueNumeric, null);
  assert.equal(result.value.unit, null);
});

test("a non-finite valueNumeric is rejected", () => {
  const result = validateAssumptionInput({ ...VALID, valueNumeric: "not-a-number" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("valueNumeric must be a finite number")));
});

test("status defaults to active and rejects an unknown value", () => {
  assert.equal(validateAssumptionInput(VALID).value.status, "active");
  assert.equal(validateAssumptionInput({ ...VALID, status: "not-a-status" }).valid, false);
  for (const s of ASSUMPTION_STATUSES) {
    assert.equal(validateAssumptionInput({ ...VALID, status: s }).valid, true);
  }
});

test("over-length fields are rejected (name, boundTo, unit, sourceNote)", () => {
  assert.equal(validateAssumptionInput({ ...VALID, name: "x".repeat(301) }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, boundTo: "x".repeat(301) }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, unit: "x".repeat(61) }).valid, false);
  assert.equal(validateAssumptionInput({ ...VALID, sourceNote: "x".repeat(2001) }).valid, false);
});

test("sourceNote is optional", () => {
  const { sourceNote: _sourceNote, ...rest } = VALID;
  const result = validateAssumptionInput(rest);
  assert.equal(result.valid, true);
  assert.equal(result.value.sourceNote, null);
});

test("isAtRisk is true only when both load-bearing and vulnerable are true (spec 03 section 7 #7)", () => {
  assert.equal(isAtRisk({ loadBearing: true, vulnerable: true }), true);
  assert.equal(isAtRisk({ loadBearing: true, vulnerable: false }), false);
  assert.equal(isAtRisk({ loadBearing: false, vulnerable: true }), false);
  assert.equal(isAtRisk({ loadBearing: false, vulnerable: false }), false);
});

test("validateAssumptionInput never throws on garbage input", () => {
  assert.doesNotThrow(() => validateAssumptionInput(null));
  assert.doesNotThrow(() => validateAssumptionInput(undefined));
  assert.doesNotThrow(() => validateAssumptionInput("a string"));
  assert.doesNotThrow(() => validateAssumptionInput(42));
  assert.equal(validateAssumptionInput(null).valid, false);
});
