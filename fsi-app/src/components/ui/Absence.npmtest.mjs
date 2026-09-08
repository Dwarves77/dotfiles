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
// both and doubling the affected rows' height. The rule decided in Absence.tsx's own header, a
// narrow cell gets the dash, a wide cell gets the reason, is enforced here at both ends: the
// variant exists and carries the reason to assistive tech, and the two narrow cells use it.
test("narrow variant renders the dash and still carries the closed-vocabulary reason", () => {
  assert.match(SOURCE, /variant\?:\s*"reason"\s*\|\s*"narrow"/);
  assert.match(SOURCE, /if \(variant === "narrow"\)/);
  assert.match(SOURCE, /aria-label=\{reason\}/);
  assert.match(SOURCE, /title=\{reason\}/);
  // UPDATED AT FOLD-61: the dash is drawn by `content` on this span's ::after rather than as a
  // JSX text child, because the same ONE element now shows the dash above 768 and the small-caps
  // reason below it (the mobile 390 spec's "Absence keeps its small-caps reason", against
  // opsclip's 40px tier track). U+2014 is asserted, in the form the stylesheet writes it.
  assert.match(SOURCE, /content: "\\\\2014"/);
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.match(SOURCE, /cl-absence-word/);
  // and the reason itself is still rendered, so it is available to read at the width that has room
  assert.match(SOURCE, /<span className="cl-absence-word"[\s\S]*?\{reason\}/);
});

test("the reason variant is unchanged: no dash, no aria-label, the ruling 2.1 treatment", () => {
  // UPDATED AT FOLD-61. Lane mobfix61 put `cl-absence` on this variant so the design audit can
  // assert `count: 1` over `.cl-list-row .cl-absence`, which reformatted the one-line return this
  // test matched verbatim. The INVARIANT is unchanged and is now asserted on its substance rather
  // than on its formatting: the wide variant renders the reason itself, on the shared text style,
  // with no dash and no aria-label (those belong to the narrow variant alone).
  const wide = SOURCE.slice(SOURCE.indexOf("// `cl-absence` (lane mobfix61"));
  assert.match(wide, /className="cl-absence"/);
  assert.match(wide, /style=\{ABSENCE_TEXT_STYLE\}/);
  assert.match(wide, /\{reason\}/);
  assert.doesNotMatch(wide, /aria-label/);
  assert.doesNotMatch(wide, /—/);
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
  // ListRow's TIER cell: a 40px fixed grid track (GRID's seventh column). UPDATED AT FOLD-61:
  // lane mobfix61's D-M4 made the row pick ONE reason for the whole row (ListRow's `reasonSlot`),
  // so the tier cell no longer hardcodes "not in primary source" - it renders the row's single
  // reason, and it is still the narrow variant, which is the half this test guards.
  assert.match(LIST_ROW, /<Absence reason=\{rowAbsence\} variant="narrow" \/>/);
  // RegionDimensionMatrix's empty region cell.
  assert.match(MATRIX, /<Absence reason="not in primary source" variant="narrow" \/>/);
});

test("the wide cells keep the spelled-out reason (ruling 2.1's presentation where it fits)", () => {
  // The DUE cell (84px) and the mobile matrix card's summary badge are not narrow cells. UPDATED
  // AT FOLD-61 for the same D-M4 reason as above: the due cell renders the row's single reason
  // rather than a hardcoded "pending", and renders it in the WIDE variant, which is the half this
  // test guards. `reasonSlot === "due"` is what routes "pending" here.
  assert.match(LIST_ROW, /<Absence reason=\{rowAbsence\} \/>/);
  assert.match(MATRIX, /<Absence reason="not in primary source" \/>/);
});
