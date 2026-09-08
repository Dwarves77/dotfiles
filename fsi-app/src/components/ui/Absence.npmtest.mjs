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

// UPDATED (items B3/B4/B5, operator 2026-09-08): the LIST ROW no longer uses either of these two
// variants. Its value cells draw the `dash` variant (a dash at every width, reason on
// aria-label/title) and its ONE spelled-out reason sits on the title cell's meta line. The
// operations matrix still uses `narrow`, which is why that variant stays in Absence.tsx; the wide
// spelled-out form is the meta line's and the matrix's mobile summary badge's.
test("the operations matrix keeps the narrow variant in its own narrow cells", () => {
  assert.match(MATRIX, /<Absence reason="not in primary source" variant="narrow" \/>/);
  assert.doesNotMatch(LIST_ROW, /<Absence[^/]*variant="narrow" \/>/, "the row's cells draw the dash instead (B4)");
});

test("the row's ONE spelled-out reason renders on the meta line, and every empty value cell draws the dash", () => {
  assert.match(LIST_ROW, /<Absence reason=\{metaReason\} \/>/, "the meta line carries the word");
  assert.match(LIST_ROW, /<Absence reason=\{rowAbsence \?\? "pending"\} variant="dash" \/>/, "the date cell draws a dash (B5)");
  assert.match(LIST_ROW, /<Absence reason=\{rowAbsence \?\? "not in primary source"\} variant="dash" \/>/, "the tier cell draws a dash (B4)");
  assert.match(MATRIX, /<Absence reason="not in primary source" \/>/, "the matrix's mobile summary badge keeps the words");
});

test("the dash variant is a dash and only a dash, and declares itself to the rendering guard", () => {
  const dash = SOURCE.slice(SOURCE.indexOf('if (variant === "dash")'), SOURCE.indexOf('if (variant === "narrow")'));
  assert.match(dash, /data-absence="dash"/, "the guard's placeholder-literal scan skips a declared dash");
  assert.match(dash, /aria-label=\{reason\}/);
  assert.match(dash, /title=\{reason\}/);
  assert.match(dash, /className="cl-absence-dash"/);
  assert.doesNotMatch(dash, /className="cl-absence"/, "the dash is a value placeholder, not the countable reason token");
  assert.doesNotMatch(dash, /\{reason\}\s*<\/span>/, "the dash never renders the word as text");
});