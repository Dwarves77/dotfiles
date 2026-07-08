// TEMPORARY branch-protection proof #2 (dispatch 2026-07-08): deliberately-failing test in a
// glob-covered directory. The Discipline engine required check must go RED and GitHub must
// refuse the merge. PR closes unmerged; this file never lands on master.
import { test } from "node:test";
import assert from "node:assert/strict";
test("deliberate red #2 — coverage must catch this and protection must refuse the merge", () => {
  assert.equal(1, 2, "deliberately red");
});
