import { test } from "node:test";
import assert from "node:assert/strict";
import { meetsFloor, FLOOR } from "./anonymity-floor.mjs";

test("FLOOR is the ADR-035 numbers: >= 10 orgs, <= 25% share", () => {
  assert.equal(FLOOR.minOrgs, 10);
  assert.equal(FLOOR.maxShare, 0.25);
});

test("FLOOR is frozen, a caller cannot mutate the shared constant", () => {
  assert.throws(() => {
    "use strict";
    FLOOR.minOrgs = 5;
  });
});

test("meets the floor: exactly 10 orgs, exactly 25% share", () => {
  assert.equal(meetsFloor({ orgCount: 10, maxShare: 0.25 }), true);
});

test("fails the floor: 9 orgs (one short)", () => {
  assert.equal(meetsFloor({ orgCount: 9, maxShare: 0.1 }), false);
});

test("fails the floor: 10 orgs but dominance over 25%", () => {
  assert.equal(meetsFloor({ orgCount: 10, maxShare: 0.26 }), false);
});

test("fails the floor: 0 orgs", () => {
  assert.equal(meetsFloor({ orgCount: 0, maxShare: 0 }), false);
});

test("well clear of the floor", () => {
  assert.equal(meetsFloor({ orgCount: 34, maxShare: 0.18 }), true);
});

test("non-finite orgCount/maxShare fail closed, never throw", () => {
  assert.equal(meetsFloor({ orgCount: NaN, maxShare: 0.1 }), false);
  assert.equal(meetsFloor({ orgCount: 10, maxShare: NaN }), false);
  assert.equal(meetsFloor({ orgCount: undefined, maxShare: undefined }), false);
});
