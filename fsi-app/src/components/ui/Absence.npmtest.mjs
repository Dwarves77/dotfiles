// Structural regression test for Absence.tsx (fix58-tokens, 2026-09-07, design audit B78-B79).
// Ruling 2.1: "the small-caps absence reason... at 10.5px uppercase/600 #7A6E6C." "small-caps" in
// the ruling means the reader's impression, achieved with plain text-transform:uppercase in the
// artboard's own markup — not the CSS font-variant:small-caps keyword. Text-level check, same
// convention as Chips.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Absence.tsx"),
  "utf8"
);

test("uppercase via text-transform (the artboard's own technique), letter-spacing .08em (ruling 2.1), not font-variant small-caps at .02em", () => {
  assert.match(SOURCE, /textTransform:\s*"uppercase"/);
  assert.match(SOURCE, /letterSpacing:\s*"0\.08em"/);
  assert.doesNotMatch(SOURCE, /fontVariant:\s*"small-caps"/);
});

test("600 weight, --ink-3 (#7A6E6C), 10.5px — ruling 2.1's exact numbers", () => {
  assert.match(SOURCE, /fontWeight:\s*600/);
  assert.match(SOURCE, /color:\s*"var\(--ink-3\)"/);
  assert.match(SOURCE, /fontSize:\s*"var\(--fs-105\)"/);
});
