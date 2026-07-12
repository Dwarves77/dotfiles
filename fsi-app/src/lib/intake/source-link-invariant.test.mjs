// @ts-check
// GOLDEN (line-read-is-not-verification, RD-14/RD-22): the source-link LIVE-DATA invariant pure core.
// Depless — findSourceLessLiveViolations is pure .mjs. A synthetic source-less live row FAILS the invariant;
// a grandfathered one and an archived one do NOT. This is the belt-side proof (the chokepoint gate golden
// lives in mint-source-link.npmtest.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSourceLessLiveViolations, GRANDFATHERED_SOURCELESS } from "./source-link-invariant.mjs";

const GF = GRANDFATHERED_SOURCELESS[0];

test("RED: a source-less LIVE row (not grandfathered) is a violation", () => {
  const rows = [{ id: "new-orphan", source_id: null, is_archived: false }];
  const v = findSourceLessLiveViolations(rows, []);
  assert.equal(v.length, 1);
  assert.equal(v[0].id, "new-orphan");
});

test("GREEN: a LIVE row WITH a source_id is not a violation", () => {
  const rows = [{ id: "ok", source_id: "src-1", is_archived: false }];
  assert.equal(findSourceLessLiveViolations(rows, []).length, 0);
});

test("an ARCHIVED source-less row is exempt (invariant is about LIVE rows)", () => {
  const rows = [{ id: "old", source_id: null, is_archived: true }];
  assert.equal(findSourceLessLiveViolations(rows, []).length, 0);
});

test("a GRANDFATHERED source-less live row is reported-not-failed (Unit 3 owns re-sourcing)", () => {
  const rows = [{ id: GF, source_id: null, is_archived: false }];
  assert.equal(findSourceLessLiveViolations(rows).length, 0, "default grandfather list exempts the T9 orphans");
  // but a DIFFERENT source-less live row alongside it still fails
  const mixed = [{ id: GF, source_id: null, is_archived: false }, { id: "new", source_id: null, is_archived: false }];
  const v = findSourceLessLiveViolations(mixed);
  assert.equal(v.length, 1);
  assert.equal(v[0].id, "new");
});

test("the default grandfather list is exactly the two T9 orphans (should only ever shrink)", () => {
  assert.equal(GRANDFATHERED_SOURCELESS.length, 2);
  assert.ok(GRANDFATHERED_SOURCELESS.every((id) => /^[0-9a-f-]{36}$/.test(id)), "full UUIDs");
});
