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

// ── ABSENCE RULE, REVISED (lane PARITY-PARTS look-only pass, 2026-09-25, against the new
// artboards): OPERATOR CHECK 5 (2026-09-24, "a missing value renders NOTHING") is reversed one day
// later by the coordinator close addendum: "a value that exists is shown; one that cannot exist
// yet names the data it needs" (README 0.4, re-exported 2026-09-25). `reason` (the default) now
// renders a "needs ..." phrase from the closed `NEEDS_PHRASE` map; "pending", "unscored" and "not
// scored" must never render as literal words. `narrow`/`dash` keep the 2026-09-24 em-dash
// treatment for fixed-width cells (this file's own DEFECT 3 note), now carrying the needs-phrase
// on aria-label/title instead of the closed-vocabulary reason string.
test("narrow and dash variants render only the value-placeholder em dash, at every width, with the needs-phrase on aria-label/title", () => {
  assert.match(SOURCE, /variant\?:\s*"reason"\s*\|\s*"narrow"\s*\|\s*"dash"/);
  assert.match(SOURCE, /if \(variant === "dash" \|\| variant === "narrow"\)/);
  assert.match(SOURCE, /aria-label=\{NEEDS_PHRASE\[reason\]\}/);
  assert.match(SOURCE, /title=\{NEEDS_PHRASE\[reason\]\}/);
  // Rendered output is byte-identical either way (both forms are U+2014); the SOURCE form changed
  // 2026-09-26 (lane MASTER-022) from the literal character to the JS escape, per discipline rule
  // 022 (no raw em/en dash or section-sign glyph in added source text) and matching existing repo
  // convention for a rendered dash placeholder (MarketComparativeRibbon.tsx, timeline-parse.mjs).
  assert.match(SOURCE, /\{"\\u2014"\}/, "renders the dash placeholder via the JS escape, not the literal character");
  assert.doesNotMatch(SOURCE, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(SOURCE, /cl-absence-word/);
});

test("the reason variant (default) renders a needs-phrase from the closed vocabulary, never nothing", () => {
  assert.match(SOURCE, /if \(variant === "reason"\) \{/);
  assert.match(SOURCE, /\{NEEDS_PHRASE\[reason\]\}/);
});

test("NEEDS_PHRASE never spells the banned words 'pending', 'unscored' or 'not scored'", () => {
  const map = SOURCE.slice(SOURCE.indexOf("NEEDS_PHRASE:"), SOURCE.indexOf("};", SOURCE.indexOf("NEEDS_PHRASE:")));
  assert.doesNotMatch(map, /:\s*"pending"/);
  assert.doesNotMatch(map, /:\s*"unscored"/);
  assert.doesNotMatch(map, /:\s*"not scored"/i);
  assert.match(map, /"not in primary source":\s*"needs primary-source figure"/);
  assert.match(map, /unscored:\s*"needs scoring inputs"/);
  assert.match(map, /"connect data":\s*"connect ↗"/);
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

test("the dash/narrow render is a dash and only a dash, and declares itself to the rendering guard", () => {
  const start = SOURCE.indexOf('if (variant === "dash" || variant === "narrow")');
  assert.notEqual(start, -1);
  const dash = SOURCE.slice(start, SOURCE.indexOf("return null;", start));
  assert.match(dash, /data-absence="dash"/, "the guard's placeholder-literal scan skips a declared dash");
  assert.match(dash, /aria-label=\{NEEDS_PHRASE\[reason\]\}/);
  assert.match(dash, /title=\{NEEDS_PHRASE\[reason\]\}/);
  assert.match(dash, /className="cl-absence-dash"/);
  assert.doesNotMatch(dash, /className="cl-absence"/, "the dash is a value placeholder, not the countable reason token");
  assert.doesNotMatch(dash, /\{reason\}\s*<\/span>/, "the dash never renders the raw reason as text");
});