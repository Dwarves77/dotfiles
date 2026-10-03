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

// REGRESSION (lane L8, 2026-10-02, spec 03-research.md section 10 "Theme rendering" own-finding):
// "A finding matching no theme regex is counted in the tiles and rendered in zero bands... verified
// content is silently invisible." Before this lane's fix, the early-return guard was
// `if (themes.length === 0) return null;` with NO prop at all for an unclassified count - a caller
// with zero recognized themes but some unclassified rows had no way to render anything for them, by
// construction, regardless of how many such rows existed. These two tests encode that defect
// (BEFORE) and its fix (AFTER) directly against the source text, the same convention this file's
// other tests already use for a component with no JSX mount infrastructure here.
test("BEFORE/defect check: the component accepts an unclassifiedCount prop at all (the pre-fix signature had none - a caller could not surface an unclassified count even if it wanted to)", () => {
  assert.match(SOURCE, /unclassifiedCount/);
});

test("AFTER/fix: the empty-row guard no longer hides the band when themes is empty but unclassifiedCount is nonzero - this is the exact defect named in the spec, now closed", () => {
  assert.match(SOURCE, /if \(themes\.length === 0 && unclassifiedCount <= 0\) return null;/);
  // The old guard (themes.length === 0 alone) must not be the ONLY condition left in the codebase  - 
  // confirm it was replaced, not merely supplemented by dead code sitting beside it.
  assert.doesNotMatch(SOURCE, /if \(themes\.length === 0\) return null;/);
});

test("the Unclassified pill is its own control, toggles via the same onSelect contract as a real theme (key: \"unclassified\"), and renders only when the count is positive - a permanent safety net per the spec's own design intent, not a one-time cleanup artifact", () => {
  assert.match(SOURCE, /unclassifiedCount > 0 && \(/);
  assert.match(SOURCE, /onSelect\(isSelected \? null : "unclassified"\)/);
  assert.match(SOURCE, />\s*Unclassified\s*</);
});

test("the Unclassified pill carries the same geometry/typography as a real theme card (law 4: consistent treatment for the same action) but a quieter, dashed treatment - an honest absence state, never a jarring error callout", () => {
  assert.match(SOURCE, /data-audit="theme-card-unclassified"/);
  assert.match(SOURCE, /border: `1px dashed/);
  assert.match(SOURCE, /minHeight: 36/g);
});
