// TEMPORARY branch-protection proof (dispatch 2026-07-08): deliberately-failing test.
// This file exists ONLY on the proof branch; the PR is closed unmerged after GitHub
// refuses the merge. Never lands on master.
import { test } from "node:test";
import assert from "node:assert/strict";
test("deliberate red — branch protection must refuse this merge", () => {
  assert.equal(1, 2, "deliberately red for the protection proof");
});
