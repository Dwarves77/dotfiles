// COMPOSITION fixture for verifyCandidate's reachability gate — asserts the short-circuit
// outcome->action mapping WITHOUT touching prod (replaces the retired d1interp/d1methodswap
// harnesses' intent: a non-answer queues, it does not reject).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideReachabilityAction } from "../../src/lib/sources/verification-decision.mjs";
import { REACH } from "../../src/lib/sources/reachability.mjs";

test("BUG-CLASS: INCONCLUSIVE -> tier M -> QUEUED-PROVISIONAL (a non-answer is queued, not rejected)", () => {
  const d = decideReachabilityAction(REACH.INCONCLUSIVE);
  assert.equal(d.shortCircuit, true);
  assert.equal(d.tier, "M");
  assert.equal(d.action, "queued-provisional");
});
test("DEAD -> tier L -> REJECTED (a definitive 404/410 is a genuine negative)", () => {
  const d = decideReachabilityAction(REACH.DEAD);
  assert.equal(d.shortCircuit, true);
  assert.equal(d.tier, "L");
  assert.equal(d.action, "rejected");
});
test("REACHABLE -> no short-circuit (falls through to content + AI + aggregateTier)", () => {
  const d = decideReachabilityAction(REACH.REACHABLE);
  assert.equal(d.shortCircuit, false);
});
test("MUTATION: INCONCLUSIVE and DEAD take DIFFERENT actions (queued vs rejected — collapsing them fails)", () => {
  assert.notEqual(decideReachabilityAction(REACH.INCONCLUSIVE).action, decideReachabilityAction(REACH.DEAD).action);
});
