// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx.
//
// REWRITTEN 2026-09-08 (lane opsmatrix3) for the operator's matrix redesign. The tests that stood
// here measured the expand-a-dimension design: the `<td colSpan>` facts row, its `repeat(N,1fr)`
// per-region grid, the two-component LegacyFactRow/EnvelopedFactRow split, the `.cl-ops-matrix-
// cards` mobile reflow: every one of which is now DELETED from the product. Keeping them would
// have been a suite passing against markup that no longer exists.
//
// THE DIVISION OF LABOUR between this file and operations-matrix.json is deliberate and is stated
// in that spec's own notes: the audit runner renders ONE state and reads computed style, so it
// measures everything visible at rest (the 40px row, the Anton 16 cell, the selection tint and
// inset, the panel's background and rule, the fact card's type sizes, the sticky column, the hint,
// the legend, and the default selection via the exact panel heading it produces). What it cannot
// do is press a key. The KEYBOARD MODEL and the DELETIONS are therefore proven here, against the
// component's source text: the same no-JSX-harness constraint WatchButton.npmtest.mjs records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "RegionDimensionMatrix.tsx"), "utf8");
// CODE is SOURCE with every comment removed. The deletion tests below assert that a retired
// construct is ABSENT, and this file's own header explains at length which constructs were retired
// and why: so asserting against the raw text would fail on the explanation rather than on the
// code. Stripping comments is what makes "deleted, not dormant" checkable without forbidding the
// file from documenting what it deleted.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const GLOBALS = readFileSync(resolve(HERE, "../../app/globals.css"), "utf8");
const LEDGER = readFileSync(resolve(HERE, "OperationsLedger.tsx"), "utf8");

// ── The keyboard model ──────────────────────────────────────────────────────────────────────────
// "Arrow keys move the selection; panel follows" (operator spec). That is a focus model, not a
// hover: the grid has one tab stop, the four arrows move it, and the panel renders FROM the
// selection so it cannot fall out of step with it.

test("the table is a grid with explicit row/cell roles, so aria-selected is valid on its cells", () => {
  assert.match(SOURCE, /role="grid"/);
  assert.match(SOURCE, /role="row"/);
  assert.match(SOURCE, /role="gridcell"/);
  assert.match(SOURCE, /role="rowheader"/);
  assert.match(SOURCE, /role="columnheader"/);
});

test("all four arrows move the selection, plus Home and End along the row", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.match(SOURCE, new RegExp(`${key}: \\[`), `${key} is a movement`);
  }
  // Movement is clamped, not wrapped: `Math.max(0, Math.min(...))` on both axes. An arrow at the
  // edge must be a no-op, never a jump to the opposite corner.
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(dimensions\.length - 1, r\)\)/);
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(regions\.length, c\)\)/);
});

test("roving tabindex: the selected cell is the only tab stop, and every other cell is -1", () => {
  // Two cells render tabIndex: the row header (column 0) and the region cell, and BOTH are
  // conditional on being the selected one. A literal `tabIndex={0}` on either would put every cell
  // in the tab order, which is the anti-pattern the grid role exists to avoid.
  const stops = SOURCE.match(/tabIndex=\{\w+Selected \? 0 : -1\}/g) ?? [];
  assert.equal(stops.length, 2, "the row header and the region cell, each a conditional tab stop");
  assert.doesNotMatch(SOURCE, /tabIndex=\{0\}/, "no unconditional tab stop inside the grid");
});

test("column 0 is IN the grid, so the row header is reachable by arrow and not only by pointer", () => {
  // ArrowLeft from the first region column (c = 1) lands on c = 0, which is the row header, which
  // is compare mode. This is what makes every selectable target reachable from the first by arrow
  // alone: the reachability rule, without a mouse.
  assert.match(SOURCE, /onKeyDown=\{\(e\) => onCellKeyDown\(e, ri, 0\)\}/, "the row header handles the same keys");
  assert.match(SOURCE, /regionKey: cc === 0 \? null : regions\[cc - 1\]\.key/, "column 0 maps to compare mode");
});

test("the panel FOLLOWS the selection by construction, not by a second effect that could drift", () => {
  // `resolved` is derived from the selection; the panel renders from `resolved`. There is no
  // setState that copies the selection into a panel-specific piece of state, which is the shape
  // that lets two things disagree.
  assert.match(SOURCE, /const rowIndex = resolved \? dimensions\.findIndex/);
  assert.match(SOURCE, /selectedDimension = rowIndex >= 0 \? dimensions\[rowIndex\] : null/);
});

test("focus follows a MOVE but never the initial default render", () => {
  // Focusing on mount would yank a keyboard reader who has not reached the matrix yet. The flag is
  // set only inside `select`, which is the click/key path; the default selection sets no flag.
  assert.match(SOURCE, /const moveRef = useRef\(false\)/);
  assert.match(SOURCE, /moveRef\.current = true;\n\s+setSelection\(next\)/);
  assert.match(SOURCE, /if \(!moveRef\.current\) return;/);
});

test("the selected cell has a real accessible name and points at the panel it controls", () => {
  // The name carries all three facts a screen reader needs at the cell: which region, which
  // dimension (with its D-number), and how many sourced facts: including the honest zero.
  assert.match(SOURCE, /aria-label=\{`\$\{r\.label\}, \$\{dimensionLabel\(d\)\}, \$\{n === 0 \? "no sourced fact"/);
  assert.match(SOURCE, /aria-label=\{`\$\{dimensionLabel\(d\)\}, compare across every region`\}/);
  const controls = SOURCE.match(/aria-controls=\{panelId\}/g) ?? [];
  assert.equal(controls.length, 2, "both the row header and the region cell name the panel");
});

test("the panel is announced as the selected cell's content", () => {
  assert.match(SOURCE, /id=\{panelId\}/);
  assert.match(SOURCE, /role="region"/);
  assert.match(SOURCE, /aria-live="polite"/);
  assert.match(SOURCE, /aria-label=\{panelHeading\(/, "the live region names what it now holds");
});

// ── The default selection ───────────────────────────────────────────────────────────────────────

test("the default selection scans ROWS outer, REGIONS inner: first sourced cell in the first sourced row", () => {
  // Loop ORDER is the whole rule. Regions outer would return the first sourced cell of the first
  // sourced COLUMN, which is a different cell whenever the earliest sourced row and the earliest
  // sourced column do not intersect. The audit proves the same rule by outcome (its fixture leaves
  // two rows and two columns empty and asserts the resulting panel heading); this asserts the
  // mechanism, so a refactor that happened to keep the fixture's answer still fails here.
  const block = SOURCE.slice(SOURCE.indexOf("const defaultSelection"), SOURCE.indexOf("// A selection the props"));
  assert.match(block, /for \(const d of dimensions\) \{\s*\n\s*for \(const r of regions\) \{/);
  assert.match(block, /if \(c && c\.factCount > 0\) return \{ regionKey: r\.key, dimDb: d\.db \}/);
  // The fallback is compare mode on row 0, never a cell asserted to hold facts it does not have.
  assert.match(block, /return dimensions\.length > 0 \? \{ regionKey: null, dimDb: dimensions\[0\]\.db \} : null/);
});

test("a selection the props no longer carry falls back to the default rather than pointing off-screen", () => {
  // The rail scopes columns, so a selected region can vanish under the reader.
  assert.match(SOURCE, /const dimOk = dimensions\.some\(\(d\) => d\.db === selection\.dimDb\)/);
  assert.match(SOURCE, /const regionOk = selection\.regionKey === null \|\| regions\.some/);
  assert.match(SOURCE, /return dimOk && regionOk \? selection : defaultSelection/);
});

// ── The absence convention ──────────────────────────────────────────────────────────────────────

test("an unsourced cell is the narrow Absence: the artboard's dash carrying its closed-vocabulary reason", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
  assert.match(SOURCE, /<Absence reason="not in primary source" variant="narrow" \/>/);
  assert.doesNotMatch(CODE, />\s*—\s*</, "no bare em-dash text node: a bare dash is a placeholder literal by the app's own SoT");
  assert.doesNotMatch(SOURCE, />\s*no data\s*</);
});

test("an unsourced cell is SELECTABLE and its panel states the absence plainly", () => {
  // The decision, logged in DEVIATION-LOG.md: a dead cell would put holes in the arrow-key grid and
  // leave "why is this empty?" with nowhere to click. Nothing gates selection on factCount.
  assert.doesNotMatch(SOURCE, /factCount > 0 \?\s*\n?\s*<td/, "no branch renders an unselectable cell");
  assert.match(SOURCE, /data-audit="ops-panel-absent"/);
  assert.match(SOURCE, /no producer has written \{dimensionLabel\(dimension\)\} for\{" "\}/);
  assert.match(SOURCE, /Nothing is estimated in its place/);
});

test("the fact card's empty figure slot says 'pending', never a sentence promoted into the display face", () => {
  assert.match(SOURCE, /const \{ figure, description, prose \} = factHeadline\(f\)/);
  assert.match(SOURCE, /<Absence reason="pending" \/>/);
  const card = SOURCE.slice(SOURCE.indexOf("function MatrixFactCard"), SOURCE.indexOf("// ── Shared cell geometry"));
  assert.equal(
    (card.match(/var\(--font-display\)/g) ?? []).length,
    1,
    "the display face appears exactly once in the card: on the figure",
  );
});

// ── What was DELETED, not left dormant (CLAUDE.md rule 13) ──────────────────────────────────────
// Each assertion below names one thing the redesign removed. They are here so a later edit cannot
// quietly reintroduce the retired design one piece at a time.

test("the expanded-row code path is gone: no colspan cell, no per-region fact grid, no open state", () => {
  assert.doesNotMatch(CODE, /colSpan/, "the full-width facts cell is deleted");
  assert.doesNotMatch(CODE, /gridTemplateColumns/, "its repeat(N,1fr) per-region grid is deleted");
  assert.doesNotMatch(CODE, /openDimension|resolvedOpen|defaultOpenDimension/, "the open-dimension state is deleted");
  assert.doesNotMatch(CODE, /aria-expanded/, "nothing in the table expands, so nothing declares that it does");
  assert.doesNotMatch(CODE, /▸|▾/, "the disclosure glyph is deleted");
});

test("the two fact-row components are collapsed into one, because factHeadline routes both shapes", () => {
  assert.doesNotMatch(CODE, /function LegacyFactRow|function EnvelopedFactRow/);
  assert.match(SOURCE, /function MatrixFactCard/);
  assert.equal((SOURCE.match(/data-audit="ops-fact-card"/g) ?? []).length, 1, "one fact card anatomy, one place");
});

test("the base-region control is gone and indexAgainstBase moved into compare mode rather than dying with it", () => {
  assert.doesNotMatch(CODE, /Compare against/, "the control's own label");
  assert.doesNotMatch(CODE, /baseRegion|setBaseRegion|orderRegions|anyEnveloped|baseFactFor/);
  // Superseded, not dropped: the library function is still called, from the panel's compare mode.
  assert.match(CODE, /indexAgainstBase/, "still live: a dead export would be rule 13 the other way round");
  assert.match(SOURCE, /const baseFact = compareRows\.find\(\(x\) => x\.fact && isEnvelopedFact\(x\.fact\)\)/);
});

test("compare mode renders one headline card per region, stacked, each labelled with its region", () => {
  assert.match(SOURCE, /const compare = region === null/);
  assert.match(SOURCE, /compareRows\.map\(\(\{ region: r, fact \}\)/);
  assert.match(SOURCE, /<MatrixFactCard fact=\{fact\} baseFact=\{fact === baseFact \? null : baseFact\} \/>/);
});

test("the duplicate <=640px card reflow is deleted from BOTH the component and globals.css", () => {
  assert.doesNotMatch(CODE, /cl-ops-matrix-cards|ops-region-card/, "the second rendering of the same data is gone");
  assert.doesNotMatch(GLOBALS, /\.cl-ops-matrix-cards \{/, "and so are the rules that drove it");
  assert.doesNotMatch(GLOBALS, /\.cl-ops-matrix-table \{ display: none/, "the table is no longer hidden at any width");
});

// ── The table card ──────────────────────────────────────────────────────────────────────────────

test("the card clips and the SCROLLER is the inner box, with the shared scroll-shadow definition", () => {
  assert.match(SOURCE, /className="cl-ops-matrix-table cl-scroll-shadow"/);
  assert.match(SOURCE, /data-guard-strip="true"/, "declared a scrolling strip, not a must-fit container");
  assert.match(GLOBALS, /\.cl-scroll-shadow \{[\s\S]*overflow-x: auto/, "the shared scroller survives");
  assert.match(GLOBALS, /scrollbar-gutter: stable/);
});

test("the sticky first column requires separate borders, and the file says why", () => {
  // `borderCollapse: collapse` shares one border between neighbours, so a sticky cell painted over
  // its neighbour loses the shared edge as it scrolls. This is the kind of coupling that gets
  // "tidied" back to `collapse` by a later edit unless it is asserted.
  assert.match(SOURCE, /borderCollapse: "separate", borderSpacing: 0/);
  assert.match(SOURCE, /position: "sticky"/);
  assert.match(SOURCE, /borderRight: "1px solid var\(--line-2\)"/);
});

test("the scroll hint is drawn only when there is somewhere to scroll to", () => {
  // Telling a reader to scroll a table that does not move is a false affordance, and the hint's
  // region figure is counted from the column roster, never stated.
  assert.match(SOURCE, /const COLUMNS_BEFORE_SCROLL = 5/);
  assert.match(SOURCE, /const scrolls = regions\.length > COLUMNS_BEFORE_SCROLL/);
  assert.match(SOURCE, /scrolls \? ` · \$\{regions\.length\} regions · scroll` : ""/);
});

test("the column floors sum to less than the card's width at 1440, so they scroll a phone without overflowing a desktop", () => {
  // REPLACES "no minWidth floor survives on any header cell". That test encoded a real 1440
  // overflow, but it encoded the WRONG cause: the overflow came from FACTS being rendered into the
  // region columns, where each fact's prose set its column's minimum content width. The facts moved
  // to the panel, and with no floor at all the table crushed instead of scrolling at 375 (the
  // rendering guard measured the dimension column at 21px, twelve lines of one character). The
  // honest invariant is arithmetic, so it is asserted as arithmetic: floors that a five-region
  // table can carry inside the card at 1440.
  const dim = Number(SOURCE.match(/const DIMENSION_COL_MIN = (\d+)/)[1]);
  const region = Number(SOURCE.match(/const REGION_COL_MIN = (\d+)/)[1]);
  assert.ok(dim >= 160, "the dimension column must hold its longest name without wrapping to a column of letters");
  assert.ok(dim + 5 * region <= 700, `five region columns plus the dimension column fit the card at 1440 (got ${dim + 5 * region})`);
});

// ── D4: the linked-regulations count, unchanged in rule by this lane ────────────────────────────
// The figure is derived from OperationsLedger's progressively loaded row set. Published mid-flight
// it is a WRONG number that changes under the reader (the "27 -> 777" the clickthrough audit saw).
// There is now ONE branch rather than two, because the mobile card reflow that carried the second
// one is deleted; the rule it enforces is identical.

test("D4: the cross-reference count names its loading state rather than printing a partial figure", () => {
  assert.equal((SOURCE.match(/crossRefCountsPending/g) ?? []).length, 3, "the prop, its default, and the one branch");
  assert.match(SOURCE, /crossRefCountsPending\s*\n?\s*\? " · counting regs…"/);
});

// ── The page-level lines this lane needed ───────────────────────────────────────────────────────

test("the rail's REGION facet scopes the matrix's COLUMNS, the same one-line shape the DIMENSION facet uses for rows", () => {
  assert.match(LEDGER, /const matrixRegions = useMemo\(\s*\n\s*\(\) => \(filter\.region \? regions\.filter\(\(r\) => r\.key === filter\.region\) : regions\)/);
  assert.match(LEDGER, /regions=\{matrixRegions\.map/);
});

test("the matrix receives the D-number from the same DIMENSIONS constant the rail's D1-D6 labels read", () => {
  assert.match(LEDGER, /dimensions=\{matrixDimensions\.map\(\(d\) => \(\{ key: d\.key, db: d\.db, name: d\.name, num: d\.num \}\)\)\}/);
});

test("the profile href is built from rows the page already holds, and a region without one gets no link", () => {
  assert.match(LEDGER, /if \(isRegulationItem\(r\) \|\| !r\.id\) continue;/);
  assert.match(LEDGER, /map\[region\] = `\/operations\/\$\{encodeURIComponent\(r\.id\)\}`/);
  assert.match(CODE, /profileHref=\{selectedRegion \? profileHrefByRegion\[selectedRegion\.key\] \?\? null : null\}/);
  assert.match(SOURCE, /\{!compare && profileHref && \(/, "no profile row means no Open profile link");
});
