// Structural regression test for src/components/Sidebar.tsx — operator audit item 4.2 (2026-09-07,
// CLOSED ruling): "Nav card top margin becomes 20px (margin: 20px 0 16px 16px) so it aligns with
// the content column's 20px top padding. Fix it in the frame, once." Source-text regression (no
// JSX render harness in this repo — see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Sidebar.tsx"),
  "utf8"
);

test("desktop nav card margin is 20px 0 16px 16px (item 4.2)", () => {
  assert.match(SOURCE, /margin: "20px 0 16px 16px"/);
  assert.doesNotMatch(SOURCE, /margin: "16px 0 16px 16px"/);
});

test("maxHeight accounts for the new 36px total vertical margin (20 + 16), not the old 32px", () => {
  assert.match(SOURCE, /maxHeight: "calc\(100vh - 36px\)"/);
});

test("fix58-tokens (2026-09-07, design audit B95-B98): desktop card section label is 700/.14em (dc.html p1), not 800/.12em", () => {
  assert.match(SOURCE, /fontWeight:\s*700,\s*\n\s*letterSpacing:\s*"0\.14em",/);
  assert.doesNotMatch(SOURCE, /fontWeight:\s*drawer \? 700 : 800/);
});

test("fix58-tokens: active nav row (card variant) uses the inset 3px spine box-shadow, not border-left, and weighs 700 not 800", () => {
  assert.match(SOURCE, /boxShadow:\s*active \? "inset 3px 0px 0px var\(--brand\)" : "none"/);
  assert.match(SOURCE, /fontWeight:\s*active \? 700 : 600/);
  assert.doesNotMatch(SOURCE, /borderLeft:\s*`2px solid \$\{active/);
});
