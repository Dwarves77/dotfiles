// Tests for brief-staleness.mjs (flywheel U6). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob (run-test-suite.sh + CI, same pattern as theme-stats.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { computeMemberHash, isBriefStale } from "./brief-staleness.mjs";

// Reference implementation of the documented recipe, computed independently of the module under test,
// so this suite proves the recipe (sort lexicographically, join empty, md5 hex) rather than just
// re-asserting whatever computeMemberHash happens to do.
function referenceHash(ids) {
  const sorted = [...ids].sort();
  return createHash("md5").update(sorted.join("")).digest("hex");
}

test("computeMemberHash: matches the documented recipe — sorted, empty-joined, md5 hex", () => {
  const ids = ["b-id", "a-id", "c-id"];
  assert.equal(computeMemberHash(ids), referenceHash(ids));
  assert.equal(computeMemberHash(ids), createHash("md5").update("a-idb-idc-id").digest("hex"));
});

test("computeMemberHash: order-independent — input order never changes the hash", () => {
  const a = ["zzz", "aaa", "mmm"];
  const b = ["mmm", "zzz", "aaa"];
  assert.equal(computeMemberHash(a), computeMemberHash(b));
});

test("computeMemberHash: does not mutate the input array", () => {
  const ids = ["z", "a", "m"];
  const copy = [...ids];
  computeMemberHash(ids);
  assert.deepEqual(ids, copy);
});

test("computeMemberHash: degenerate input never throws", () => {
  assert.equal(computeMemberHash([]), createHash("md5").update("").digest("hex"));
  assert.equal(computeMemberHash(undefined), createHash("md5").update("").digest("hex"));
  assert.equal(computeMemberHash(null), createHash("md5").update("").digest("hex"));
});

test("isBriefStale: matching hash against current membership => fresh (false)", () => {
  const memberIds = ["item-3", "item-1", "item-2"];
  const storedHash = computeMemberHash(memberIds);
  assert.equal(isBriefStale(storedHash, memberIds), false);
});

test("isBriefStale: stored hash from a different membership => stale (true)", () => {
  const generatedAgainst = ["item-1", "item-2"];
  const storedHash = computeMemberHash(generatedAgainst);
  const liveMembers = ["item-1", "item-2", "item-3"]; // membership grew since generation
  assert.equal(isBriefStale(storedHash, liveMembers), true);
});

test("isBriefStale: same member set, different array order => still fresh", () => {
  const storedHash = computeMemberHash(["a", "b", "c"]);
  assert.equal(isBriefStale(storedHash, ["c", "a", "b"]), false);
});

test("isBriefStale: a member swapped out for another of the same count => stale", () => {
  const storedHash = computeMemberHash(["a", "b", "c"]);
  assert.equal(isBriefStale(storedHash, ["a", "b", "d"]), true);
});
