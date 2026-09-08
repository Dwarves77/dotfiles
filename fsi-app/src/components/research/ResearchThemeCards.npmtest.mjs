// Structural regression test for ResearchThemeCards.tsx (lane comp-06, 2026-09-08, artboard
// 06/id="p6", the theme card row below the band tiles).
//
// Text-level, the same convention ListRow.npmtest.mjs's own header explains: `node --test` has no
// JSX mount infrastructure here, and the real-DOM check for this row is the design audit's
// compose-06-research-list.json spec, which measures the mounted component's geometry, its
// document position (theme cards before the Window row) and its forbid list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "ResearchThemeCards.tsx"), "utf8");
const TAXONOMY = readFileSync(resolve(HERE, "..", "..", "lib", "research", "taxonomy.mjs"), "utf8");

test("labels and descriptions come from the shared taxonomy, never a page-local vocabulary", () => {
  assert.match(SOURCE, /import \{ THEME_DESCRIPTIONS, THEME_LABELS \} from "@\/lib\/research\/taxonomy\.mjs";/);
  assert.doesNotMatch(SOURCE, /Emissions accounting/);
});

test("the four descriptions the artboard states are the taxonomy's, verbatim", () => {
  assert.match(TAXONOMY, /Methodology shifts that change how the workspace reports Scope 3\./);
  assert.match(TAXONOMY, /Production capacity, feedstock constraints, price trajectory\./);
  assert.match(TAXONOMY, /EV cargo capacity, charging rollout, zero-emission cargo bays\./);
  assert.match(TAXONOMY, /CSRD omnibus, ISSB S2, emerging frameworks\./);
});

test("a theme the artboard gives no description renders the head row alone, never invented copy", () => {
  assert.match(SOURCE, /\{description && \(/);
});

test("each card is a real control with a 44px hit target and a pressed state, not a decorative tile", () => {
  assert.match(SOURCE, /type="button"/);
  assert.match(SOURCE, /aria-pressed=\{isSelected\}/);
  assert.match(SOURCE, /minHeight: 44/);
});

test("clicking the selected card clears the theme (the facet is a toggle, like every other facet)", () => {
  assert.match(SOURCE, /onClick=\{\(\) => onSelect\(isSelected \? null : theme\.key\)\}/);
});

test("the artboard's four-across grid and its selected-border value", () => {
  assert.match(SOURCE, /gridTemplateColumns: "repeat\(4, 1fr\)"/);
  assert.match(SOURCE, /isSelected \? "var\(--brand\)" : "var\(--line-1\)"/);
});

test("+N new is suppressed at zero rather than rendering '+0 new'", () => {
  assert.match(SOURCE, /\{theme\.newCount > 0 && \(/);
});
