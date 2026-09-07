// Structural regression test for src/components/ui/StateNote.tsx — operator audit item 2.6
// (2026-09-07, CLOSED ruling): border-left 3px solid <band>; background <band tint>; radius
// 0 6px 6px 0; padding 9px 12px; neutral variant #5A5552 (--brand) on #F5F2EE (--tag). Source-text
// regression (no JSX render harness in this repo — see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "StateNote.tsx"),
  "utf8"
);

test("neutral (no-band) variant resolves to --brand (#5A5552), not --ink-2", () => {
  assert.match(SOURCE, /band \? band\.cssVar : "var\(--brand\)"/);
  assert.doesNotMatch(SOURCE, /band \? band\.cssVar : "var\(--ink-2\)"/);
});

test("neutral (no-band) background stays --tag (#F5F2EE)", () => {
  assert.match(SOURCE, /band \? band\.tintCssVar : "var\(--tag\)"/);
});

test("shape: border-left 3px solid <color>, radius 0 6px 6px 0, padding 9px 12px", () => {
  assert.match(SOURCE, /borderLeft: `3px solid \$\{color\}`/);
  assert.match(SOURCE, /borderRadius: "0 6px 6px 0"/);
  assert.match(SOURCE, /padding: "9px 12px"/);
});

test("fix58-tokens (2026-09-07, design audit statenote.json): action link is 600 weight (dc.html p15 'See audit log'), not 700", () => {
  const matches = SOURCE.match(/fontWeight:\s*(\d+),/g) ?? [];
  assert.ok(matches.length >= 2, "expected both the <a> and <button> action-link variants");
  for (const m of matches) assert.match(m, /fontWeight:\s*600,/);
});
