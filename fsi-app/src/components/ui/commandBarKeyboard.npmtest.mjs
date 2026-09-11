// Unit tests for CommandBar's pure keyboard/dismissal helpers (lane SEARCHKEYS, 2026-09-11).
// Closes docs/tech-debt-log.md's "CommandBar Standard Search listbox has no Escape/click-
// outside/arrow-key handling" (2026-09-11). Same jiti-import convention as
// tagPopoverKeyboard.npmtest.mjs, but moveActiveIndex is its OWN function here, not a re-export —
// see commandBarKeyboard.ts's header: the dispatch brief requires clamp-not-wrap movement, which
// tagPopoverKeyboard.ts's own (wrapping) moveHighlight does not provide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { moveActiveIndex, isOutsidePointerDown, optionId, activeDescendantId } =
  await jiti.import("./commandBarKeyboard.ts");

// ── clamp, not wrap (dispatch brief, verbatim: "ArrowUp/Down clamp (not wrap)") ──
test("moveActiveIndex: ArrowDown past the last row CLAMPS at the last row, never wraps to the first", () => {
  assert.equal(moveActiveIndex(2, 1, 3), 2);
});
test("moveActiveIndex: ArrowUp past the first row CLAMPS at the first row, never wraps to the last", () => {
  assert.equal(moveActiveIndex(0, -1, 3), 0);
});
test("moveActiveIndex: a middle index still moves one step each way, same as any roving index", () => {
  assert.equal(moveActiveIndex(1, 1, 3), 2);
  assert.equal(moveActiveIndex(1, -1, 3), 0);
});
test("moveActiveIndex: down from -1 (nothing active) goes to the first row", () => {
  assert.equal(moveActiveIndex(-1, 1, 3), 0);
});
test("moveActiveIndex: up from -1 goes to the last row", () => {
  assert.equal(moveActiveIndex(-1, -1, 3), 2);
});
test("moveActiveIndex: empty result list → always -1", () => {
  assert.equal(moveActiveIndex(-1, 1, 0), -1);
});

// ── outside-pointerdown dismissal ──
test("isOutsidePointerDown: inside the bar → not outside", () => {
  assert.equal(isOutsidePointerDown(true, false), false);
});
test("isOutsidePointerDown: inside the portaled listbox → not outside", () => {
  assert.equal(isOutsidePointerDown(false, true), false);
});
test("isOutsidePointerDown: inside both (should not happen, but neither is exclusive) → not outside", () => {
  assert.equal(isOutsidePointerDown(true, true), false);
});
test("isOutsidePointerDown: inside neither → outside, dismiss", () => {
  assert.equal(isOutsidePointerDown(false, false), true);
});

// ── option ids / aria-activedescendant ──
test("optionId: deterministic, keyed off the listbox id and the option's index", () => {
  assert.equal(optionId("cl-command-bar-listbox", 0), "cl-command-bar-listbox-option-0");
  assert.equal(optionId("cl-command-bar-listbox", 3), "cl-command-bar-listbox-option-3");
});
test("activeDescendantId: -1 (nothing active) → undefined, never a dangling id", () => {
  assert.equal(activeDescendantId("cl-command-bar-listbox", -1), undefined);
});
test("activeDescendantId: an active index → that option's id", () => {
  assert.equal(activeDescendantId("cl-command-bar-listbox", 2), "cl-command-bar-listbox-option-2");
});
