// GOLDEN — the fetch-seam holdings guard (no-execution-from-stale-state, operator ruling 2026-07-14).
// Proves: an item with usable stored content CANNOT admit a fetch (present -> refuse); only genuine absence
// (no real snapshot AND <=1 thin pool row) admits one; the precondition posture is recorded for spend-watch.
// Run: node --test src/lib/sources/holdings-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdingsPresent, holdingsPrecondition, SNAPSHOT_STUB_MAX, MIN_USABLE_POOL_ROWS } from "./holdings-gate.mjs";

test("holdingsPresent: a real snapshot is holdings -> present (fetch refused)", () => {
  assert.equal(holdingsPresent({ snapshotBytes: 75923, usablePoolRows: 0 }), true); // o9: 76KB held
  assert.equal(holdingsPresent({ snapshotBytes: 232003, usablePoolRows: 1 }), true); // ukrtfo
  assert.equal(holdingsPresent({ snapshotBytes: SNAPSHOT_STUB_MAX + 1, usablePoolRows: 0 }), true);
});

test("holdingsPresent: >=2 content-bearing pool rows is holdings -> present", () => {
  assert.equal(holdingsPresent({ snapshotBytes: 0, usablePoolRows: 7 }), true); // china/canada/india: pool held
  assert.equal(holdingsPresent({ snapshotBytes: 0, usablePoolRows: MIN_USABLE_POOL_ROWS }), true);
  assert.equal(holdingsPresent({ snapshotBytes: 175, usablePoolRows: 23 }), true); // imo338: stub snap but deep pool
});

test("holdingsPresent: genuine absence (stub/no snapshot AND <=1 thin pool row) -> admits a fetch", () => {
  assert.equal(holdingsPresent({ snapshotBytes: 0, usablePoolRows: 1 }), false);   // g19
  assert.equal(holdingsPresent({ snapshotBytes: 175, usablePoolRows: 1 }), false); // imo377/zecorr/glec: stub + 1 pool
  assert.equal(holdingsPresent({ snapshotBytes: 0, usablePoolRows: 0 }), false);
  assert.equal(holdingsPresent({}), false);
});

test("holdingsPrecondition: records the check + live counts for the spend ticket (amendment 1)", () => {
  const absent = holdingsPrecondition({ snapshotBytes: 0, usablePoolRows: 1 });
  assert.equal(absent.check, "holdings-absence");
  assert.equal(absent.result, "confirmed_absent"); // only this posture may accompany a paid fetch
  assert.equal(absent.snapshotBytes, 0);
  assert.equal(absent.usablePoolRows, 1);
  const present = holdingsPrecondition({ snapshotBytes: 75923, usablePoolRows: 7 });
  assert.equal(present.result, "present"); // a fetch under this posture is the waste the guard refuses
});
