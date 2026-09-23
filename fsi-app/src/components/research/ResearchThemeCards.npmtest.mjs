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

test("a theme with no description is never invented copy; the description carries as a native tooltip", () => {
  assert.match(SOURCE, /title=\{description\}/);
});

test("each pill is a real control with a pressed state and law-2's 24px+8px-clearance alternative, not a decorative tile", () => {
  assert.match(SOURCE, /type="button"/);
  assert.match(SOURCE, /aria-pressed=\{isSelected\}/);
  assert.match(SOURCE, /minHeight: 36/);
  assert.match(SOURCE, /gap: 8/);
});

test("clicking the selected pill clears the theme (the facet is a toggle, like every other facet)", () => {
  assert.match(SOURCE, /onClick=\{\(\) => onSelect\(isSelected \? null : theme\.key\)\}/);
});

test("fixed lane W10-NavCard 2026-09-23: a wrapping facet row, not a tile grid, and the selected-border value carries over", () => {
  assert.match(SOURCE, /display: "flex", flexWrap: "wrap"/);
  assert.doesNotMatch(SOURCE, /gridTemplateColumns: "repeat/);
  assert.match(SOURCE, /isSelected \? "var\(--brand\)" : "var\(--line-1\)"/);
});

test("+N new is suppressed at zero rather than rendering '+0 new'", () => {
  assert.match(SOURCE, /\{theme\.newCount > 0 && \(/);
});
