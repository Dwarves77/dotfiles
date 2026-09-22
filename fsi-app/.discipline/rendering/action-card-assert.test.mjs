// action-card-assert.test.mjs: red-then-green proof of the pure detector core (lane
// W10-ActionCard-a, 2026-09-21), same posture as ux-assert.test.mjs. Each test plants a violation
// fixture (RED, the detector must catch it), then a clean fixture (GREEN, the detector must pass
// it) so the detector is proven both directions, never presence-only (CLAUDE.md rule 15).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectClampedOverflow,
  detectEmptyDotLabels,
  detectTruncatedLabels,
  detectStandaloneSwitch,
  detectCardCountViolation,
} from "./action-card-assert.mjs";

test("detectClampedOverflow: RED on a cell over 3 lines, GREEN at or under 3", () => {
  const red = detectClampedOverflow([{ lines: 8, text: "an 8-line trajectory sentence" }, { lines: 1, text: "ok" }]);
  assert.equal(red.length, 1);
  assert.equal(red[0].text, "an 8-line trajectory sentence");

  const green = detectClampedOverflow([{ lines: 3, text: "exactly at the clamp" }, { lines: 1, text: "ok" }]);
  assert.equal(green.length, 0);
});

test("detectClampedOverflow: empty/non-array input never throws", () => {
  assert.deepEqual(detectClampedOverflow([]), []);
  assert.deepEqual(detectClampedOverflow(null), []);
  assert.deepEqual(detectClampedOverflow(undefined), []);
});

test("detectEmptyDotLabels: RED on an empty or whitespace-only label, GREEN on a real one", () => {
  const red = detectEmptyDotLabels(["Transition deadline", "", "  ", "Decision adopted"]);
  assert.equal(red.length, 2);

  const green = detectEmptyDotLabels(["Transition deadline", "Decision adopted"]);
  assert.equal(green.length, 0);
});

test("detectTruncatedLabels: RED when scrollWidth exceeds clientWidth past tolerance, GREEN when equal or under", () => {
  const red = detectTruncatedLabels([
    { text: "S2 Obligations", scrollWidth: 140, clientWidth: 100 },
    { text: "S1 Summary", scrollWidth: 60, clientWidth: 60 },
  ]);
  assert.equal(red.length, 1);
  assert.equal(red[0].text, "S2 Obligations");

  const green = detectTruncatedLabels([
    { text: "S2 Obligations", scrollWidth: 100, clientWidth: 100 },
    { text: "S1 Summary", scrollWidth: 59, clientWidth: 60 },
  ]);
  assert.equal(green.length, 0);
});

test("detectStandaloneSwitch: RED when the switch is not a child of the nav, GREEN when it is", () => {
  const red = detectStandaloneSwitch([{ isChildOfNav: false }]);
  assert.equal(red.length, 1);

  const green = detectStandaloneSwitch([{ isChildOfNav: true }]);
  assert.equal(green.length, 0);
});

test("detectCardCountViolation: RED on 0 or 2+ cards, GREEN on exactly 1", () => {
  assert.ok(detectCardCountViolation(0));
  assert.ok(detectCardCountViolation(2));
  assert.ok(detectCardCountViolation(3));
  assert.equal(detectCardCountViolation(1), null);
});
