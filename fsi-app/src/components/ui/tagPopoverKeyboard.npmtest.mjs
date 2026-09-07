// Unit tests for TagPopover's pure keyboard model (lane uitags, 2026-09-07,
// R6: "multi-select, stays open; up down move, Enter applies or creates,
// Esc closes, Backspace on an empty input removes the last applied tag").
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const {
  visibleRows,
  hasExactMatch,
  showCreateRow,
  rowCount,
  moveHighlight,
  clampHighlight,
  resolveEnterAction,
  resolveBackspaceAction,
} = await jiti.import("./tagPopoverKeyboard.ts");

const TAGS = [
  { id: "t1", name: "High Priority", itemCount: 4 },
  { id: "t2", name: "EU Watch", itemCount: 1 },
  { id: "t3", name: "Needs Review", itemCount: 0 },
];

// ── filtering ──
test("visibleRows: empty query returns everything, in order", () => {
  assert.deepEqual(visibleRows(TAGS, ""), TAGS);
});
test("visibleRows: case-insensitive substring match", () => {
  const rows = visibleRows(TAGS, "eu");
  assert.deepEqual(rows.map((r) => r.id), ["t2"]);
});
test("visibleRows: no match → empty", () => {
  assert.deepEqual(visibleRows(TAGS, "zzz"), []);
});

// ── exact match / create row ──
test("hasExactMatch: exact (case-insensitive) name → true", () => {
  assert.equal(hasExactMatch(TAGS, "high priority"), true);
  assert.equal(hasExactMatch(TAGS, "High Priority"), true);
});
test("hasExactMatch: substring but not exact → false", () => {
  assert.equal(hasExactMatch(TAGS, "high"), false);
});
test("hasExactMatch: empty query → true (no create row for an empty query)", () => {
  assert.equal(hasExactMatch(TAGS, ""), true);
});
test("showCreateRow: shown only for a non-empty query with no exact match", () => {
  assert.equal(showCreateRow(TAGS, ""), false);
  assert.equal(showCreateRow(TAGS, "High Priority"), false);
  assert.equal(showCreateRow(TAGS, "Brand New Tag"), true);
});
test("rowCount: filtered tags + create row when shown", () => {
  assert.equal(rowCount(TAGS, ""), 3);
  // "EU Watch", "Needs Review" both contain 'e' (2 filtered rows) + the create row
  // (no tag is named exactly "e") = 3.
  assert.equal(rowCount(TAGS, "e"), 3);
});
test("rowCount: create row counts as one selectable row", () => {
  // query matches nothing existing → 0 filtered + 1 create row
  assert.equal(rowCount(TAGS, "zzz-brand-new"), 1);
});

// ── ↑ ↓ movement ──
test("moveHighlight: down from -1 (nothing highlighted) goes to first row", () => {
  assert.equal(moveHighlight(-1, 1, 3), 0);
});
test("moveHighlight: up from -1 goes to last row", () => {
  assert.equal(moveHighlight(-1, -1, 3), 2);
});
test("moveHighlight: down wraps past the last row to the first", () => {
  assert.equal(moveHighlight(2, 1, 3), 0);
});
test("moveHighlight: up wraps past the first row to the last", () => {
  assert.equal(moveHighlight(0, -1, 3), 2);
});
test("moveHighlight: ordinary step within bounds", () => {
  assert.equal(moveHighlight(0, 1, 3), 1);
  assert.equal(moveHighlight(1, -1, 3), 0);
});
test("moveHighlight: empty list → always -1", () => {
  assert.equal(moveHighlight(-1, 1, 0), -1);
  assert.equal(moveHighlight(0, 1, 0), -1);
});

test("clampHighlight: keeps an in-range index unchanged", () => {
  assert.equal(clampHighlight(1, 3), 1);
});
test("clampHighlight: an index past the new (shrunk) list end clamps to the last row", () => {
  assert.equal(clampHighlight(2, 1), 0);
});
test("clampHighlight: an empty list resets to -1", () => {
  assert.equal(clampHighlight(2, 0), -1);
});
test("clampHighlight: -1 stays -1 regardless of count", () => {
  assert.equal(clampHighlight(-1, 5), -1);
});

// ── Enter ──
test("resolveEnterAction: nothing highlighted → none", () => {
  assert.deepEqual(resolveEnterAction(TAGS, "", -1), { type: "none" });
});
test("resolveEnterAction: highlighted row on an existing tag → toggle that tag", () => {
  assert.deepEqual(resolveEnterAction(TAGS, "", 1), { type: "toggle", tagId: "t2" });
});
test("resolveEnterAction: highlighted row on the create row → create with the typed (trimmed) name", () => {
  assert.deepEqual(resolveEnterAction(TAGS, "  Brand New Tag  ", 0), { type: "create", name: "Brand New Tag" });
});
test("resolveEnterAction: query exactly matches an existing tag → no create row, Enter toggles the match", () => {
  // "High Priority" is an exact match, so highlightIndex 0 is the tag itself, not a create row.
  assert.deepEqual(resolveEnterAction(TAGS, "High Priority", 0), { type: "toggle", tagId: "t1" });
});
test("resolveEnterAction: highlightIndex past the end of a real row list, no create row shown → none", () => {
  assert.deepEqual(resolveEnterAction(TAGS, "High Priority", 5), { type: "none" });
});

// ── Backspace ──
test("resolveBackspaceAction: non-empty query → none (ordinary text editing)", () => {
  assert.deepEqual(resolveBackspaceAction("abc", ["t1", "t2"]), { type: "none" });
});
test("resolveBackspaceAction: empty query, no applied tags → none", () => {
  assert.deepEqual(resolveBackspaceAction("", []), { type: "none" });
});
test("resolveBackspaceAction: empty query, applied tags present → removes the MOST RECENT (last in order)", () => {
  assert.deepEqual(resolveBackspaceAction("", ["t1", "t2", "t3"]), { type: "removeLast", tagId: "t3" });
});
