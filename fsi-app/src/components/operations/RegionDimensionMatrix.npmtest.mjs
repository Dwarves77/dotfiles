// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx (DEFECT-FIX
// item 3.3, 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's
// own header for the same constraint) — this reads the component's source text to guard the
// contract point the audit named: an empty cell (no sourced facts) renders the shared `Absence`
// convention, never a bare "no data" text span and never a blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "RegionDimensionMatrix.tsx"),
  "utf8"
);

test("imports the shared Absence part rather than a bare text span", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
});

test("every empty-cell branch renders <Absence>, never the old '— no data' / 'no data' literal", () => {
  // UPDATED (lane opsclip, train 61, defect 3). The INVARIANT is unchanged: every empty cell
  // renders the shared Absence part with a reason from the closed vocabulary, never a bare
  // literal. What changed is the count and the presentation. There are now THREE such branches,
  // because the expanded Facts row's per-region block is a real empty-cell branch of its own since
  // that row became one full-width cell holding an N-up grid (defect 1). Two of the three are
  // narrow cells (a 1/6 table column, a 1/5 grid column) and take `variant="narrow"`, the dash the
  // artboard draws; the mobile card's summary badge is not narrow and keeps the phrase.
  const narrow = SOURCE.match(/<Absence reason="not in primary source" variant="narrow" \/>/g) ?? [];
  assert.equal(narrow.length, 2, "the desktop table cell and the expanded row's per-region block");
  const matches = SOURCE.match(/<Absence reason="not in primary source" \/>/g) ?? [];
  assert.equal(matches.length, 1, "the mobile card summary badge keeps the spelled-out reason");
  assert.doesNotMatch(SOURCE, />\s*—\s*no data\s*</, "no bare em-dash 'no data' text node survives");
  assert.doesNotMatch(SOURCE, />\s*no data\s*</, "no bare 'no data' text node survives");
});

// ── Defect D4 (lane HYDRATION-59, 2026-09-07) ──────────────────────────────────────────────────
// The "N linked regulations" figure under each region column is derived from OperationsLedger's
// PROGRESSIVELY LOADED row set (a first server page of LIST_FIRST_PAGE_SIZE rows, then an
// after-paint remainder fetch). Published mid-flight it is a wrong number that changes under the
// reader — the "27 -> 777 on click" the clickthrough audit recorded (the count does not depend on
// the selected base region at all; `orderRegions` only reorders columns and `coverageByRegion` is
// keyed by region, both asserted below). While the row set is incomplete the line must say it is
// counting, never name a figure — README §0.6's own rule for a count still loading.

// FOLD-59 (2026-09-08): the INVARIANT is unchanged and is what this test still enforces — BOTH
// branches are gated on the pending flag, and each one NAMES the loading state instead of printing
// a figure. What changed is the desktop branch's copy. comp-08 rebuilt that branch as artboard
// 08/id="p8"'s compact one-line column subhead ("2/5 sourced · 778 regs"), where the mobile card's
// full "counting linked regulations…" sentence does not fit; it says "counting regs…" in the same
// slot the figure would occupy. Matching either phrasing keeps the rule (never a figure mid-flight)
// without pinning copy the artboard itself sets differently in the two places.
test("D4: both 'linked regulations' branches are gated on the pending flag", () => {
  const gated = SOURCE.match(/crossRefCountsPending \?/g) ?? [];
  assert.equal(gated.length, 2, "one in the desktop <th> branch, one in the mobile card branch");
  const pendingText = SOURCE.match(/counting (?:linked regulations|regs)/g) ?? [];
  assert.equal(pendingText.length, 2, "each branch names the loading state rather than a number");
});

test("D4: the count is keyed by region, so column reordering cannot change it", () => {
  assert.match(
    SOURCE,
    /const coverageByRegion = Object\.fromEntries\(grid\.regionCoverage\.map\(\(r: any\) => \[r\.regionKey, r\]\)\)/,
    "counts are looked up by regionKey, never by column position",
  );
  assert.match(SOURCE, /orderRegions\(regions\.map\(\(r\) => r\.key\), baseRegion\)/);
});

test("D4: the wide table keeps a scroll container AND a visible affordance", () => {
  // UPDATED (lane opsclip, train 61, defect 1): the scroll affordance is unchanged in behaviour
  // but is no longer a component-local <style> block, it is `.cl-scroll-shadow` in globals.css,
  // one definition shared with the /regulations obligations strip, which had the same missing
  // affordance. The invariant this test guards (the table has a declared horizontal-scroll
  // fallback) is intact; only where the declaration lives moved.
  assert.match(SOURCE, /className="cl-ops-matrix-table cl-scroll-shadow"/);
  const GLOBALS = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
    "utf8",
  );
  assert.match(GLOBALS, /\.cl-scroll-shadow \{[\s\S]*overflow-x: auto/, "the scroll container survives");
  assert.match(GLOBALS, /scrollbar-gutter: stable/, "the scrollbar is present before the pointer arrives");
  assert.match(GLOBALS, /background-attachment: local, local, scroll, scroll/, "edge scroll shadows say there is more table");
});

// ── DEFECT 1 (lane opsclip, train 61, 2026-09-08): the matrix fits its card ───
// Production measured clientWidth 750 against scrollWidth 948 at 1440, cutting the United Kingdom
// column mid-glyph on every line and putting the UAE column entirely off-screen, while the artboard
// (dc.html p8) fits five columns in the same card at the same width. These are the structural
// invariants that make the built table fit the way the artboard's does; the measurement itself is
// in the rendering guard (this file is the no-npm structural half).
test("the expanded Facts row is ONE full-width cell, not one cell per region column", () => {
  // This is the root cause. Facts rendered into the region's own <td> made each fact's prose set
  // that column's minimum content width, which is what dragged the table past its container.
  assert.match(SOURCE, /colSpan=\{orderedRegions\.length \+ 1\}/);
  assert.match(SOURCE, /gridTemplateColumns: `repeat\(\$\{orderedRegions\.length\}, minmax\(0, 1fr\)\)`/);
});

test("no minWidth floor survives on any header cell (the artboard declares none)", () => {
  const thead = SOURCE.slice(SOURCE.indexOf("<thead"), SOURCE.indexOf("</thead>"));
  assert.doesNotMatch(thead, /minWidth:\s*\d/, "a fixed minimum on a region column re-creates the overflow");
});

test("the fact block renders the artboard's headline figure over body-type prose, never prose in the display face", () => {
  // The figure comes from `factHeadline` (region-grid.mjs), the one place that decides which slot
  // the data goes into; a fact with no figure in the data renders the absence convention there
  // rather than promoting a sentence into Anton.
  assert.match(SOURCE, /const \{ figure, description, prose \} = factHeadline\(f\);/);
  assert.match(SOURCE, /figure \? \(/);
  assert.match(SOURCE, /<Absence reason="pending" \/>/);
  const block = SOURCE.slice(SOURCE.indexOf("function LegacyFactRow"), SOURCE.indexOf("function originClassColor"));
  // The display face appears exactly once in the block: on the figure.
  assert.equal((block.match(/var\(--font-display\)/g) ?? []).length, 1);
  assert.match(block, /\{prose\}/, "the sentence is kept, at the description's type");
});
