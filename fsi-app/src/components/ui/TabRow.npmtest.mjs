// Structural regression test for TabRow.tsx (fix58-tokens, 2026-09-07, design audit B62-B77).
// The artboard underlines the active tab (solid 2px brand) and gives every resting tab the same
// 2px TRANSPARENT rule so no tab shifts width when its state changes — text-level check, same
// convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "TabRow.tsx"),
  "utf8"
);

test("row hairline uses --line-1 (rgba(0,0,0,.12)), the design's border-bottom-color, not --line-2", () => {
  assert.match(SOURCE, /borderBottom:\s*"1px solid var\(--line-1\)"/);
});

test("each tab is 12.5px/9px 12px, active weight 700 (not 800)", () => {
  assert.match(SOURCE, /fontSize:\s*"var\(--fs-125\)"/);
  assert.match(SOURCE, /padding:\s*"9px 12px"/);
  assert.match(SOURCE, /fontWeight:\s*t\.active \? 700 : 600/);
});

test("active tab carries a solid 2px brand underline; resting tabs carry the same 2px transparent rule, pulled onto the hairline with margin-bottom -1px", () => {
  assert.match(SOURCE, /borderBottom:\s*t\.active \? "2px solid var\(--brand\)" : "2px solid transparent"/);
  assert.match(SOURCE, /marginBottom:\s*-1/);
});
