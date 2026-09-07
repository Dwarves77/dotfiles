// Structural regression test for CommandBar.tsx (fix58-tokens, 2026-09-07, design audit B88-B94).
// Text-level, same convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "CommandBar.tsx"),
  "utf8"
);

test("outer form border is rgba(0,0,0,.25) at radius 8px (dc.html p1), not the --line-1/6px token pair", () => {
  assert.match(SOURCE, /border:\s*"1px solid rgba\(0,0,0,\.25\)"/);
  assert.match(SOURCE, /borderRadius:\s*8,/);
});

test("cmd-K hint is 10px monospace (dc.html p1), not 10.5px sans", () => {
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontSize:\s*"var\(--fs-10\)"/);
  assert.match(SOURCE, /className="cl-cmdk-hint"[\s\S]{0,300}fontFamily:\s*"ui-monospace/);
});

test("Ask button is full-bar height (40px) with 14px horizontal padding (dc.html p1), not a fixed 30px/16px", () => {
  assert.match(SOURCE, /height:\s*40,\s*\n\s*padding:\s*"0 14px"/);
});
