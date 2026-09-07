// Structural regression test for StatBlock.tsx (fix58-tokens, 2026-09-07, design audit B80-B87).
// Text-level, same convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "StatBlock.tsx"),
  "utf8"
);

test("row-layout numeral is 18px (dc.html p1 'Across the platform' rows), not 20px", () => {
  assert.match(SOURCE, /fontSize:\s*layout === "row" \? 18 : 26/);
});

test("label is 10px/.12em/700 in stack layout (dc.html p14), 12.5px/700 in row layout — one weight, not 800 for stack", () => {
  assert.match(SOURCE, /fontSize:\s*layout === "row" \? "var\(--fs-125\)" : "var\(--fs-10\)"/);
  assert.match(SOURCE, /letterSpacing:\s*layout === "row" \? "normal" : "0\.12em"/);
  assert.doesNotMatch(SOURCE, /fontWeight:\s*layout === "row" \? 700 : 800/);
});

test("note is 10.5px / --ink-3 (#7A6E6C) in both layouts (dc.html p1/p14)", () => {
  const noteBlock = SOURCE.slice(SOURCE.indexOf("const note_"), SOURCE.indexOf("if (layout"));
  assert.match(noteBlock, /fontSize:\s*"var\(--fs-105\)"/);
  assert.match(noteBlock, /color:\s*"var\(--ink-3\)"/);
});

// ── size="tile" (train 58, 2026-09-07, dc.html id="p13" Platform admin's 8-tile grid) ──────────────

function tileBlock() {
  return SOURCE.slice(SOURCE.indexOf('if (size === "tile")'), SOURCE.indexOf('const numeral = loading'));
}

test('size="tile" is an accepted prop value', () => {
  assert.match(SOURCE, /size\?:\s*"default"\s*\|\s*"tile"/);
});

test("tile numeral is 16px Anton (dc.html p13)", () => {
  const block = tileBlock();
  assert.match(block, /fontSize:\s*16/);
  assert.match(block, /fontFamily:\s*"var\(--font-display\)"/);
});

test("tile label is 11px / .1em / 800 / uppercase (dc.html p13)", () => {
  const block = tileBlock();
  assert.match(block, /fontSize:\s*"var\(--fs-11\)"/);
  assert.match(block, /letterSpacing:\s*"0\.1em"/);
  assert.match(block, /fontWeight:\s*800/);
  assert.match(block, /textTransform:\s*"uppercase"/);
});

test("tile note is 11.5px / --ink-2 (#5A6B67), 4px margin-top (dc.html p13)", () => {
  const block = tileBlock();
  assert.match(block, /fontSize:\s*"var\(--fs-115\)"/);
  assert.match(block, /color:\s*"var\(--ink-2\)"/);
  assert.match(block, /marginTop:\s*4/);
});

test('tile size ignores layout — no "layout ===" branch inside the tile block', () => {
  assert.doesNotMatch(tileBlock(), /layout ===/);
});
