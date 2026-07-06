// @ts-check
// Red-then-green for the thinning guard (ruling 2026-07-04). THE regression proven first: the funded-pass
// batch-1 case (24 -> 1) MUST be caught; a legitimate small reduction (24 -> 20) MUST NOT be; tiny briefs are
// exempt. The guard restores prior grounding on a catch, so a false-positive is costly (blocks a good
// re-ground) — hence the threshold is conservative (below HALF, and only for prior >= floor).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isThinningRegression, THINNING_FLOOR } from "./thinning-guard.mjs";

test("CATCH: the batch-1 regression 24 -> 1 is a thinning regression", () => {
  assert.equal(isThinningRegression(24, 1), true);
  assert.equal(isThinningRegression(24, 0), true);   // total collapse
  assert.equal(isThinningRegression(30, 5), true);   // f0833999-scale prior, collapse to a handful
});

test("PASS: a legitimate reduction that keeps most grounding is NOT thinning", () => {
  assert.equal(isThinningRegression(24, 20), false); // trimmed a few bad claims — fine
  assert.equal(isThinningRegression(24, 12), false); // exactly half — allowed (threshold is BELOW half)
  assert.equal(isThinningRegression(65, 40), false); // 7a0ead55-scale, healthy
});

test("EXEMPT: tiny prior grounding is not guarded (a 3 -> 1 drop is noise, not a regression)", () => {
  assert.equal(THINNING_FLOOR, 4);
  assert.equal(isThinningRegression(3, 1), false);
  assert.equal(isThinningRegression(3, 0), false);
  assert.equal(isThinningRegression(0, 0), false);
  // exactly at the floor with a collapse IS guarded
  assert.equal(isThinningRegression(4, 1), true);
});

test("defensive: non-numeric inputs coerce to 0 (no throw)", () => {
  assert.equal(isThinningRegression(undefined, undefined), false);
  assert.equal(isThinningRegression(10, null), true); // prior 10, new 0 -> thinning
});
