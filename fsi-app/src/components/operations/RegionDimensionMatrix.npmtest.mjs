// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx.
//
// REWRITTEN 2026-09-08 (lane opsmatrix3) for the operator's matrix redesign. The tests that stood
// here measured the expand-a-dimension design: the `<td colSpan>` facts row, its `repeat(N,1fr)`
// per-region grid, the two-component LegacyFactRow/EnvelopedFactRow split, the `.cl-ops-matrix-
// cards` mobile reflow: every one of which is now DELETED from the product. Keeping them would
// have been a suite passing against markup that no longer exists.
//
// AMENDED 2026-09-08 (lane noexpand) for the operator's "no items expanded when first navigtaing to
// a page" ruling. Two tests here asserted the DEFAULT SELECTION -- its scan order, and the fallback
// that re-pointed a stale selection at it. That whole mechanism is deleted from the product, so both
// were re-pointed rather than dropped: the scan-order test became a test that NO default is computed
// at all, which is a strictly stronger statement about the same lines (it forbids the construct
// instead of constraining it), and the stale-selection test now asserts the fallback is `null`, so
// the panel CLOSES rather than jumping to a cell the reader never chose. Two tests were ADDED for
// the focus/selection split ruling R5 requires. Nothing was weakened.
//
// THE DIVISION OF LABOUR between this file and the two audit specs is deliberate and is stated in
// their own notes: the audit runner renders ONE state and reads computed style. `operations-matrix
// .json` measures the state a reader ARRIVES at (nothing selected, no panel, one tab stop) and
// `operations-matrix-selected.json` measures the state after its mount CLICKS a cell (the tint, the
// inset, the panel and everything in it). What neither can do is press a key. The KEYBOARD MODEL and
// the DELETIONS are therefore proven here, against the component's source text: the same
// no-JSX-harness constraint WatchButton.npmtest.mjs records.
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
// The operator's matrix spec said "Arrow keys move the selection; panel follows". His LATER ruling
// (2026-09-08, "no items expanded when first navigtaing to a page") splits that in two, because a
// reader arrowing across the scoreboard must not have panels opening under him: arrows move FOCUS,
// and a click, Enter or Space commits. So the grid has one tab stop, the four arrows move it, and
// the panel renders FROM the committed selection, which starts empty.

test("the table is a grid with explicit row/cell roles, so aria-selected is valid on its cells", () => {
  assert.match(SOURCE, /role="grid"/);
  assert.match(SOURCE, /role="row"/);
  assert.match(SOURCE, /role="gridcell"/);
  assert.match(SOURCE, /role="rowheader"/);
  assert.match(SOURCE, /role="columnheader"/);
});

test("all four arrows move the FOCUS, plus Home and End along the row", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.match(SOURCE, new RegExp(`${key}: \\[`), `${key} is a movement`);
  }
  // Movement is clamped, not wrapped: `Math.max(0, Math.min(...))` on both axes. An arrow at the
  // edge must be a no-op, never a jump to the opposite corner.
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(dimensions\.length - 1, r\)\)/);
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(regions\.length, c\)\)/);
  // An arrow calls moveFocus, NOT selectAt. This is ruling R5's whole content: a reader who arrows
  // across the scoreboard reading scores never makes a panel appear under him.
  assert.match(SOURCE, /moveFocus\(moves\[e\.key\]\[0\], moves\[e\.key\]\[1\]\)/);
  assert.doesNotMatch(SOURCE, /selectAt\(moves\[e\.key\]/, "an arrow must not select");
});

test("Enter and Space are the only KEYS that select, and they select the focused cell", () => {
  assert.match(SOURCE, /if \(e\.key === "Enter" \|\| e\.key === " "\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*selectAt\(r, c\);/);
});

test("FOCUS AND SELECTION ARE TWO STATES, and only one of them paints (ruling R5)", () => {
  // The whole defect the operator found was one state doing both jobs: the component computed a
  // selection so the grid would have a tab stop, and the selection painted a panel. Two states, so
  // the grid can be reachable with nothing chosen.
  assert.match(SOURCE, /const \[selection, setSelection\] = useState<Selection \| null>\(null\)/);
  assert.match(SOURCE, /const \[focusPos, setFocusPos\] = useState<\{ r: number; c: number \}>\(\{ r: 0, c: 0 \}\)/);
  // tabIndex reads the FOCUS position; aria-selected reads the SELECTION. Crossing those two wires
  // is exactly how a preselected cell comes back.
  assert.match(SOURCE, /tabIndex=\{headerFocused \? 0 : -1\}/);
  assert.match(SOURCE, /tabIndex=\{isFocusCell \? 0 : -1\}/);
  assert.match(SOURCE, /aria-selected=\{headerSelected\}/);
  assert.match(SOURCE, /aria-selected=\{isSelected\}/);
});

test("roving tabindex: the FOCUSED cell is the only tab stop, and every other cell is -1", () => {
  // Two cells render tabIndex: the row header (column 0) and the region cell, and BOTH are
  // conditional on holding the roving FOCUS position. A literal `tabIndex={0}` on either would put
  // every cell in the tab order, which is the anti-pattern the grid role exists to avoid.
  // AMENDED (lane noexpand): the condition was `\w+Selected` while a default selection guaranteed
  // one cell was selected on mount. With no default selection that spelling would leave the grid
  // with NO tab stop at all and make it unreachable by keyboard, which is precisely what ruling R5
  // forbids. Same count, same shape, read off focus instead of selection.
  const stops = SOURCE.match(/tabIndex=\{(headerFocused|isFocusCell) \? 0 : -1\}/g) ?? [];
  assert.equal(stops.length, 2, "the row header and the region cell, each a conditional tab stop");
  assert.doesNotMatch(SOURCE, /tabIndex=\{0\}/, "no unconditional tab stop inside the grid");
  // The roving position starts at the FIRST cell, so Tab always lands somewhere real.
  assert.match(SOURCE, /useState<\{ r: number; c: number \}>\(\{ r: 0, c: 0 \}\)/);
});

test("column 0 is IN the grid, so the row header is reachable by arrow and not only by pointer", () => {
  // ArrowLeft from the first region column (c = 1) lands on c = 0, which is the row header, which
  // is compare mode. This is what makes every selectable target reachable from the first by arrow
  // alone: the reachability rule, without a mouse.
  assert.match(SOURCE, /onKeyDown=\{\(e\) => onCellKeyDown\(e, ri, 0\)\}/, "the row header handles the same keys");
  assert.match(SOURCE, /regionKey: cc === 0 \? null : regions\[cc - 1\]\.key/, "column 0 maps to compare mode");
});

test("the panel FOLLOWS the committed selection by construction, not by a second effect that could drift", () => {
  // `resolved` is derived from the selection; the panel renders from `resolved`. There is no
  // setState that copies the selection into a panel-specific piece of state, which is the shape
  // that lets two things disagree.
  assert.match(SOURCE, /const rowIndex = resolved \? dimensions\.findIndex/);
  assert.match(SOURCE, /selectedDimension = rowIndex >= 0 \? dimensions\[rowIndex\] : null/);
});

test("focus follows a MOVE but never the initial render", () => {
  // Focusing on mount would yank a keyboard reader who has not reached the matrix yet. The flag is
  // set only inside `moveFocus`, which is the arrow/click path; the initial render sets no flag.
  assert.match(SOURCE, /const moveRef = useRef\(false\)/);
  assert.match(SOURCE, /moveRef\.current = true;\n\s+setFocusPos\(/);
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

// ── NO default selection (operator ruling 2026-09-08) ───────────────────────────────────────────
// These two tests REPLACE the two that stood here. The first asserted the default selection's scan
// order ("rows outer, regions inner"); the second asserted that a stale selection fell back TO that
// default. Both described a mechanism the operator ruled out: he navigated to /operations and found
// Infrastructure capacity already open, and wrote "no items expanded when first navigtaing to a
// page". A test of how a defect chooses its victim is not worth keeping once the defect is deleted;
// what replaces it forbids the construct outright, which is a strictly stronger statement about the
// same lines, and pins the fallback to `null` so the panel CLOSES instead of jumping.

test("there is NO default selection: the component never computes one, in any spelling", () => {
  assert.doesNotMatch(CODE, /defaultSelection/, "the defaultSelection memo is deleted, not dormant");
  // The scan that produced it: a rows-outer/regions-inner walk returning the first sourced cell.
  // Forbidden by shape as well as by name, so reintroducing it under another identifier still fails.
  assert.doesNotMatch(CODE, /factCount > 0\) return \{ regionKey/, "no first-sourced-cell scan");
  assert.doesNotMatch(CODE, /openDimension|resolvedOpen|defaultOpenDimension|defaultOpen/, "and none of the older spellings either");
  // The selection state starts null and nothing else initialises it.
  assert.match(SOURCE, /useState<Selection \| null>\(null\)/);
});

test("a selection the props no longer carry CLOSES the panel rather than pointing somewhere else", () => {
  // The rail scopes columns, so a selected region can vanish under the reader. The validity check
  // is unchanged, verbatim; only its else-branch moved from `defaultSelection` to `null`. Falling
  // back to a computed default would be the page choosing what to open, one step removed.
  assert.match(SOURCE, /const dimOk = dimensions\.some\(\(d\) => d\.db === selection\.dimDb\)/);
  assert.match(SOURCE, /const regionOk = selection\.regionKey === null \|\| regions\.some/);
  assert.match(SOURCE, /return dimOk && regionOk \? selection : null/);
  assert.match(SOURCE, /if \(!selection\) return null;/);
});

test("the panel renders ONLY from a committed selection, so no selection means no panel", () => {
  assert.match(SOURCE, /\{selectedDimension && \(/, "the panel is gated on there being a selected dimension");
  assert.match(SOURCE, /selectedDimension = rowIndex >= 0 \? dimensions\[rowIndex\] : null/);
});

test("the foot legend lives on the CARD, not inside the panel, so it survives the closed state", () => {
  // It used to sit inside the panel, which was safe only while a default selection guaranteed the
  // panel existed. With nothing open on arrival, the strip explaining the dashes and how to open a
  // cell is exactly what the reader needs, so it moved out with the default.
  // Read off CODE, not SOURCE: this file's own header explains at length that the strip MOVED and
  // quotes the wording it replaced, so a raw-text assertion would fail on the explanation.
  const panelBlock = CODE.slice(CODE.indexOf('data-audit="ops-matrix-panel"'), CODE.indexOf('data-audit="ops-matrix-foot"'));
  assert.doesNotMatch(panelBlock, /ops-matrix-foot/, "the foot is not inside the panel block");
  assert.match(CODE, /arrow keys move between cells/, "and its wording states what arrows now do");
  assert.doesNotMatch(CODE, /arrow keys move the\s+selection/, "not what they used to do");
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
