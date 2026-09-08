// Structural regression test for RowTable.tsx (lane community60, 2026-09-08).
// Text-level, same convention as StatBlock.npmtest.mjs / Chips.npmtest.mjs.
//
// WHY IT EXISTS. Artboard 12's discussion table and artboard 13's admin tables are the SAME
// anatomy at different measures, so p12 was built by extending this component rather than by
// forking a second one (CLAUDE.md rule 13). These assertions pin the two things that extension
// must never lose: p13's defaults stay p13's defaults when `metrics` is absent, and the
// whole-row click target does not swallow the overflow control's own click.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "RowTable.tsx"),
  "utf8"
);

test("metrics are optional and default to artboard 13's values (16px pad, 48px rows, no trailing rule)", () => {
  assert.match(SOURCE, /metrics\?:\s*RowTableMetrics/);
  assert.match(SOURCE, /paddingLeft\s*=\s*metrics\?\.paddingLeft\s*\?\?\s*16/);
  assert.match(SOURCE, /rowMinHeight\s*=\s*metrics\?\.rowMinHeight\s*\?\?\s*48/);
  assert.match(SOURCE, /ruleAfterLastRow\s*=\s*metrics\?\.ruleAfterLastRow\s*\?\?\s*false/);
});

test("the header strip keeps its 30px height and 1px header-weight rule", () => {
  assert.match(SOURCE, /height:\s*30,/);
  assert.match(SOURCE, /borderBottom:\s*"1px solid var\(--line-2\)"/);
});

test("padding-left is driven by the metric, never re-hardcoded in the grid", () => {
  assert.match(SOURCE, /padding:\s*`0 12px 0 \$\{paddingLeft\}px`/);
  assert.doesNotMatch(SOURCE, /padding:\s*"0 12px 0 16px"/);
});

test("a row is only a click target when the caller gives it one, and it is keyboard reachable", () => {
  assert.match(SOURCE, /role=\{r\.onActivate \? "button" : undefined\}/);
  assert.match(SOURCE, /tabIndex=\{r\.onActivate \? 0 : undefined\}/);
  assert.match(SOURCE, /e\.key === "Enter" \|\| e\.key === " "/);
});

test("the overflow control stops propagation so it cannot also activate its row", () => {
  const block = SOURCE.slice(SOURCE.indexOf("export function RowTableOverflow"));
  assert.match(block, /e\.stopPropagation\(\);/);
});

test("the overflow control is a full 44x44 target (DP-1) with the artboard's 32px divider and 28px glyph", () => {
  const block = SOURCE.slice(SOURCE.indexOf("export function RowTableOverflow"));
  assert.match(block, /width:\s*44,\s*\n\s*height:\s*44,/);
  assert.match(block, /width:\s*1,\s*height:\s*32/);
  assert.match(block, /width:\s*28,\s*\n\s*height:\s*28,/);
});

test("menu items keep the 44px minimum row", () => {
  const block = SOURCE.slice(SOURCE.indexOf("export function RowTableOverflow"));
  assert.match(block, /minHeight:\s*44,/);
});
