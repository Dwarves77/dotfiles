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

// ── placement / semantics variants (lane admin60, 2026-09-08, artboard 13) ───
// dc.html p13 draws the Sources sub-tab row INSIDE the provisional card's head:
// gap 2, the card's own 16px inset, and never wrapping, so all five tabs stay on
// one line at 1440. The page-level row (artboards 14/15) keeps gap 4 and wraps.

test("card-head placement is gap 2, 16px inset, and NEVER wraps; page placement keeps gap 4 and wraps", () => {
  assert.match(SOURCE, /gap:\s*cardHead \? 2 : 4/);
  assert.match(SOURCE, /flexWrap:\s*cardHead \? "nowrap" : "wrap"/);
  assert.match(SOURCE, /padding:\s*cardHead \? "0 16px" : undefined/);
});

test('placement and semantics both default to the pre-existing behaviour, so every existing call site is unchanged', () => {
  assert.match(SOURCE, /placement = "page"/);
  assert.match(SOURCE, /semantics = "nav"/);
});

test('tablist semantics render role="tablist" / role="tab" / aria-selected, and nav semantics render neither', () => {
  assert.match(SOURCE, /<div role="tablist"/);
  assert.match(SOURCE, /role=\{semantics === "tablist" \? "tab" : undefined\}/);
  assert.match(SOURCE, /aria-selected=\{semantics === "tablist" \? !!t\.active : undefined\}/);
});
