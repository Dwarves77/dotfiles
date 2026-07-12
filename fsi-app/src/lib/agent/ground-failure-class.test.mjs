// @ts-check
// GOLDEN (line-read-is-not-verification, RD-14/RD-22): the ground-failure RETRY PLAN (Fix B). Depless — the
// classifier is pure .mjs. Proves the structural short-circuit: `no source_id` → "structural_hold", which the
// ladder routes STRAIGHT to held-for-re-source, so ZERO re-research calls fire on a structurally-broken item.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groundRetryPlan, isStructuralGroundFailure, isDeterministicGroundFailure } from "./ground-failure-class.mjs";

test("STRUCTURAL: `no source_id` → structural_hold (skips BOTH re-ground and re-research)", () => {
  assert.equal(isStructuralGroundFailure("no source_id"), true);
  assert.equal(groundRetryPlan("no source_id"), "structural_hold");
  assert.equal(groundRetryPlan("re-ground: no source_id"), "structural_hold", "the re-ground prefix still contains the wall");
});

test("DETERMINISTIC content failure → reresearch_only (skip cheap re-ground, NOT structural)", () => {
  assert.equal(isStructuralGroundFailure("validation failed: [{reason: fact_below_authority_floor}]"), false);
  assert.equal(isDeterministicGroundFailure("validation failed: [{reason: missing_required_slot}]"), true);
  assert.equal(groundRetryPlan("validation failed: [{reason: missing_required_slot}]"), "reresearch_only");
});

test("TRANSIENT/unknown failure → reground (try the cheap stochastic re-roll first)", () => {
  assert.equal(isStructuralGroundFailure("some transient ledger slip"), false);
  assert.equal(groundRetryPlan("some transient ledger slip"), "reground");
  assert.equal(groundRetryPlan(undefined), "reground");
});

test("structural is checked FIRST (safety: never spend re-research on a structurally-broken item)", () => {
  assert.equal(groundRetryPlan("no source_id; missing_required_slot"), "structural_hold");
});
