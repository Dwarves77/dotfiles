// COMPOSITION fixture for check-sources' assessAndUpdateSource — asserts the eviction decision
// WITHOUT touching prod (replaces the retired checksrc-consumer-verify harness's intent).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSourceAssessment } from "../../src/lib/sources/check-sources-decision.mjs";
import { REACH } from "../../src/lib/sources/reachability.mjs";

test("REACHABLE -> accessible, counter++, reactivates a previously-inaccessible source", () => {
  const d = decideSourceAssessment({ outcome: REACH.REACHABLE, source: { status: "inaccessible", consecutive_accessible: 0 } });
  assert.equal(d.isAccessible, true);
  assert.equal(d.evictEligible, false);
  assert.equal(d.reactivate, true);
  assert.equal(d.consecutive_accessible, 1);
});
test("BUG-CLASS: INCONCLUSIVE (429/5xx/timeout) is NOT accessible and NEVER evict-eligible", () => {
  const d = decideSourceAssessment({ outcome: REACH.INCONCLUSIVE, source: { status: "active", consecutive_accessible: 0 } });
  assert.equal(d.isAccessible, false);
  assert.equal(d.evictEligible, false); // a non-answer must NOT mark a live source for eviction
  assert.equal(d.consecutive_accessible, 0);
});
test("DEAD (404/410) with a 0 streak IS evict-eligible (the only evictable case)", () => {
  const d = decideSourceAssessment({ outcome: REACH.DEAD, source: { status: "active", consecutive_accessible: 0 } });
  assert.equal(d.isAccessible, false);
  assert.equal(d.evictEligible, true);
});
test("DEAD but recently-accessible (streak>0) is NOT evict-eligible (one dead check doesn't evict)", () => {
  const d = decideSourceAssessment({ outcome: REACH.DEAD, source: { status: "active", consecutive_accessible: 3 } });
  assert.equal(d.evictEligible, false);
});
test("MUTATION: INCONCLUSIVE vs DEAD differ on evict-eligibility (a no-op collapsing them fails here)", () => {
  const inc = decideSourceAssessment({ outcome: REACH.INCONCLUSIVE, source: { consecutive_accessible: 0 } });
  const dead = decideSourceAssessment({ outcome: REACH.DEAD, source: { consecutive_accessible: 0 } });
  assert.notEqual(inc.evictEligible, dead.evictEligible);
});
