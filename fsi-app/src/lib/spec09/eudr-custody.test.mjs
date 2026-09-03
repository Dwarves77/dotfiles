import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyHoldRisk,
  suggestHoldRiskFromValidationState,
  classifyDoubleCountRisk,
  isBlockingSeverity,
} from "./eudr-custody.mjs";

test("classifyHoldRisk: border_hold is the blocking severity, distinct from a monetary chip", () => {
  const c = classifyHoldRisk("border_hold");
  assert.equal(c.severity, "blocking");
  assert.match(c.detail, /stops the container now|Not a monetary exposure/);
});

test("classifyHoldRisk: documentary is a warning, not blocking", () => {
  assert.equal(classifyHoldRisk("documentary").severity, "warning");
});

test("classifyHoldRisk: none is clear", () => {
  assert.equal(classifyHoldRisk("none").severity, "clear");
});

test("classifyHoldRisk: an unrecognised value is unknown, never silently clear", () => {
  const c = classifyHoldRisk("bogus");
  assert.equal(c.severity, "unknown");
  assert.notEqual(c.severity, "clear");
});

test("suggestHoldRiskFromValidationState: missing/malformed geolocation suggests border_hold", () => {
  assert.equal(suggestHoldRiskFromValidationState("missing"), "border_hold");
  assert.equal(suggestHoldRiskFromValidationState("malformed"), "border_hold");
});

test("suggestHoldRiskFromValidationState: fails_cutoff suggests documentary, valid suggests none", () => {
  assert.equal(suggestHoldRiskFromValidationState("fails_cutoff"), "documentary");
  assert.equal(suggestHoldRiskFromValidationState("valid"), "none");
});

test("suggestHoldRiskFromValidationState: unrecognised input suggests nothing (null, never guessed)", () => {
  assert.equal(suggestHoldRiskFromValidationState("bogus"), null);
});

test("classifyDoubleCountRisk: conflict_detected is blocking, a liability not a data-quality flag", () => {
  const c = classifyDoubleCountRisk("conflict_detected");
  assert.equal(c.severity, "blocking");
  assert.match(c.detail, /liability/);
});

test("classifyDoubleCountRisk: single_claim_confirmed is clear, unverified is a warning", () => {
  assert.equal(classifyDoubleCountRisk("single_claim_confirmed").severity, "clear");
  assert.equal(classifyDoubleCountRisk("unverified").severity, "warning");
});

test("isBlockingSeverity: true only for the blocking tier, from either classifier", () => {
  assert.equal(isBlockingSeverity(classifyHoldRisk("border_hold")), true);
  assert.equal(isBlockingSeverity(classifyDoubleCountRisk("conflict_detected")), true);
  assert.equal(isBlockingSeverity(classifyHoldRisk("none")), false);
  assert.equal(isBlockingSeverity(undefined), false);
});
