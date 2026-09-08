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

// ── variant="narrow" (lane opsclip, train 61, defect 3) ───────────────────────
// RED-THEN-GREEN: production rendered "NOT IN PRIMARY SOURCE" into the list row's 40px TIER track
// and into every empty cell of the five-column operations matrix, wrapping over three lines in
// both and doubling the affected rows' height. The rule decided in Absence.tsx's own header — a
// narrow cell gets the dash, a wide cell gets the reason — is enforced here at both ends: the
// variant exists and carries the reason to assistive tech, and the two narrow cells use it.
test("narrow variant renders the dash and still carries the closed-vocabulary reason", () => {
  assert.match(SOURCE, /variant\?:\s*"reason"\s*\|\s*"narrow"/);
  assert.match(SOURCE, /if \(variant === "narrow"\)/);
  assert.match(SOURCE, /aria-label=\{reason\}/);
  assert.match(SOURCE, /title=\{reason\}/);
  assert.match(SOURCE, /\{"—"\}/);
});

test("the reason variant is unchanged: no dash, no aria-label, the ruling 2.1 treatment", () => {
  assert.match(SOURCE, /return <span style=\{ABSENCE_TEXT_STYLE\}>\{reason\}<\/span>;/);
});

const LIST_ROW = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListRow.tsx"),
  "utf8"
);
const MATRIX = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../operations/RegionDimensionMatrix.tsx"),
  "utf8"
);

test("the two narrow cells the audit measured use the narrow variant", () => {
  // ListRow's TIER cell: a 40px fixed grid track (GRID's seventh column).
  assert.match(LIST_ROW, /<Absence reason="not in primary source" variant="narrow" \/>/);
  // RegionDimensionMatrix's empty region cell.
  assert.match(MATRIX, /<Absence reason="not in primary source" variant="narrow" \/>/);
});

test("the wide cells keep the spelled-out reason (ruling 2.1's presentation where it fits)", () => {
  // The DUE cell (84px) and the mobile matrix card's summary badge are not narrow cells.
  assert.match(LIST_ROW, /<Absence reason="pending" \/>/);
  assert.match(MATRIX, /<Absence reason="not in primary source" \/>/);
});
