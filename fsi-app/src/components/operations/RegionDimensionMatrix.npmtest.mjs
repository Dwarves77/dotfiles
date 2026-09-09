// Structural regression test for src/components/operations/RegionDimensionMatrix.tsx.
//
// REWRITTEN 2026-09-08 (lane opsmatrix3) for the operator's matrix redesign. The tests that stood
// here measured the expand-a-dimension design: the `<td colSpan>` facts row, its `repeat(N,1fr)`
// per-region grid, the two-component LegacyFactRow/EnvelopedFactRow split, the `.cl-ops-matrix-
// cards` mobile reflow: every one of which is now DELETED from the product. Keeping them would
// have been a suite passing against markup that no longer exists.
//
// AMENDED 2026-09-09 (lane opsmatrix5) for the operator's /operations STOP SHIP message, whose item
// 5 reads, verbatim: "Default state on load: first sourced cell of the first sourced row open", and
// whose item 3 reads "Arrow keys move the selection; panel follows; Esc closes." Both reverse the
// 2026-09-08 amendment below FOR THIS COMPONENT ONLY (coordinator note C1, 2026-09-09: the
// 2026-09-08 ruling forbade the RETIRED row-expansion pattern, and the newer message asks for this
// default selection in writing). The six tests that asserted the closed arrival state and the
// focus/selection split are RE-POINTED, not deleted, and each replacement is a narrower claim than
// the one it replaces: "no default selection is computed, in any spelling" becomes "the default
// selection is computed by a rows-outer/regions-inner scan AND the state carries three values so a
// reader's Esc is distinguishable from an untouched arrival"; "an arrow must not select" becomes
// "every arrow selects and Home/End still only move"; "no panel without a selection" becomes "the
// panel SLOT is unconditional and fixed-height, which is what makes the card's height constant".
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
// RESTORED 2026-09-09 to the operator's own words, which his 2026-09-09 message states twice: "Arrow
// keys move the selection; panel follows; Esc closes." The 2026-09-08 split (arrows move FOCUS and
// only a click, Enter or Space commits) was this project's reading of "no items expanded when first
// navigtaing to a page"; the newer message settles it directly for this component. Home and End
// still MOVE ONLY, because they jump the length of a row and selecting the far end of a row is not
// what a reader asking for the row's end meant. The panel still renders FROM the selection, and the
// selection now has three values: untouched, chosen, and closed-by-Esc.

test("the table is a grid with explicit row/cell roles, so aria-selected is valid on its cells", () => {
  assert.match(SOURCE, /role="grid"/);
  assert.match(SOURCE, /role="row"/);
  assert.match(SOURCE, /role="gridcell"/);
  assert.match(SOURCE, /role="rowheader"/);
  assert.match(SOURCE, /role="columnheader"/);
});

test("all four arrows move the FOCUS, plus Home and End along the row", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]) {
    assert.match(SOURCE, new RegExp(`${key}: \\[`), `${key} moves the selection`);
  }
  assert.match(SOURCE, /if \(e\.key === "Home" \|\| e\.key === "End"\)/, "Home and End move without selecting");
  // Movement is clamped, not wrapped: `Math.max(0, Math.min(...))` on both axes. An arrow at the
  // edge must be a no-op, never a jump to the opposite corner.
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(dimensions\.length - 1, r\)\)/);
  assert.match(SOURCE, /Math\.max\(0, Math\.min\(regions\.length, c\)\)/);
  // AN ARROW SELECTS (operator, 2026-09-09, item 3). This REPLACES `an arrow must not select`, and
  // it is the narrower assertion of the two: the old one said only that one call was absent, this
  // one names the call that must be there and pins the map it reads.
  assert.match(SOURCE, /selectAt\(selects\[e\.key\]\[0\], selects\[e\.key\]\[1\]\)/, "an arrow selects");
  // Home and End are the exception and they still MOVE ONLY.
  assert.match(SOURCE, /moveFocus\(r, e\.key === "Home" \? 0 : regions\.length\)/);
});

test("Esc closes the panel, from a cell and from anywhere else in the card", () => {
  // Operator, 2026-09-09, item 3: "Esc closes." Two handlers, because a reader who tabbed into the
  // panel to follow its links is exactly the reader most likely to want it shut, and that reader's
  // focus is not on a grid cell.
  assert.match(SOURCE, /if \(e\.key === "Escape"\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*setSelection\(null\);/);
  const handlers = SOURCE.match(/e\.key === "Escape"/g) ?? [];
  assert.equal(handlers.length, 2, "one on the grid cell, one on the card");
});

test("Enter and Space are the only KEYS that select, and they select the focused cell", () => {
  assert.match(SOURCE, /if \(e\.key === "Enter" \|\| e\.key === " "\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*selectAt\(r, c\);/);
});

test("SELECTION HAS THREE VALUES, so 'never touched' and 'deliberately closed' are different facts", () => {
  // RE-POINTED 2026-09-09 from "FOCUS AND SELECTION ARE TWO STATES, and only one of them paints".
  // The arrival state is now SELECTED (item 5) and Esc can close it (item 3), so two values are not
  // enough: `undefined` means the reader has not acted and the computed default is in force, a
  // Selection is the reader's choice, and `null` means Esc. Only `undefined` may re-open itself,
  // which is what stops Esc from being undone by the next render.
  assert.match(SOURCE, /const \[selection, setSelection\] = useState<Selection \| null \| undefined>\(undefined\)/);
  assert.match(SOURCE, /const untouched = selection === undefined/);
  assert.match(SOURCE, /if \(selection === undefined\) return defaultSelection;/);
  assert.match(SOURCE, /if \(selection === null\) return null;/);
  assert.match(SOURCE, /const \[focusPos, setFocusPos\] = useState<\{ r: number; c: number \} \| null>\(null\)/);
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
  // RE-POINTED 2026-09-09: the roving position starts on the DEFAULT SELECTION rather than on a
  // constant first cell, so Tab lands on the cell whose facts are already showing. Pinned to the
  // data-derived position, which is a narrower claim than `{ r: 0, c: 0 }`.
  assert.match(SOURCE, /const focusR = clampR\(focusPos \? focusPos\.r : Math\.max\(0, rowIndex\)\)/);
  assert.match(SOURCE, /const focusC = clampC\(focusPos \? focusPos\.c : Math\.max\(0, colIndex\)\)/);
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
  // RE-POINTED 2026-09-09: the slot is unconditional now, so its label has a second branch for the
  // Esc state. It still names what the slot holds whenever it holds something.
  assert.match(SOURCE, /selectedDimension \? panelHeading\(selectedRegion, selectedDimension, grid, regions\) : "No cell selected"/, "the live region names what it now holds");
});

// ── THE DEFAULT SELECTION (operator, 2026-09-09, item 5) ────────────────────────────────────────
// RE-POINTED 2026-09-09 (lane opsmatrix5). The two tests that stood here forbade a default selection
// outright, on the 2026-09-08 ruling. Item 5 of the 2026-09-09 message asks for one in writing:
// "Default state on load: first sourced cell of the first sourced row open." Coordinator note C1 is
// binding on the reconciliation. So these tests assert the scan ORDER and the state machine, which
// is a narrower claim about the same lines than "this construct is absent": a default that lands on
// row 0, or scans columns first, or re-opens after Esc, fails here.

test("the default selection is the FIRST SOURCED CELL OF THE FIRST SOURCED ROW: rows outer, regions inner", () => {
  assert.match(SOURCE, /const defaultSelection: Selection \| null = useMemo\(/);
  // The scan's shape, so a rewrite under another identifier still has to be the same scan: the
  // dimension loop is OUTSIDE the region loop, and the first cell with a fact wins.
  assert.match(
    SOURCE,
    /for \(const d of dimensions\) \{\s*\n\s*for \(const r of regions\) \{\s*\n\s*if \(\(grid\.byCell\[`\$\{r\.key\}\|\$\{d\.db\}`\]\?\.factCount \?\? 0\) > 0\) return \{ regionKey: r\.key, dimDb: d\.db \};/,
    "rows outer, regions inner, first sourced cell wins",
  );
  // A grid with nothing sourced anywhere selects NOTHING rather than a cell with nothing to say.
  assert.match(SOURCE, /\}\s*\n\s*return null;\s*\n\s*\}, \[dimensions, regions, grid\]\)/);
  // And none of the RETIRED spellings comes back with it: this is the row-expansion pattern the
  // 2026-09-09 message orders deleted, which is a different thing from the default selection.
  assert.doesNotMatch(CODE, /openDimension|resolvedOpen|defaultOpenDimension|defaultOpen/);
});

test("Esc is not undone by the next render: a closed panel stays closed, a default re-points", () => {
  // The three-value state's whole purpose. A selection the rail scoped away re-points at the
  // default, because that is the state the operator asked this component to arrive in; `null` from
  // Esc does not, because the reader closed it on purpose.
  assert.match(SOURCE, /const dimOk = dimensions\.some\(\(d\) => d\.db === selection\.dimDb\)/);
  assert.match(SOURCE, /const regionOk = selection\.regionKey === null \|\| regions\.some/);
  assert.match(SOURCE, /return dimOk && regionOk \? selection : defaultSelection;/);
  assert.match(SOURCE, /if \(selection === null\) return null;/);
});

test("the arrival state is DECLARED to the site-wide no-default-open gate, not hidden from it", () => {
  // The matrix is that gate's ONE allowed exception (coordinator note C2, 2026-09-09), and it uses
  // the escape hatch open-state-sweep.mjs already provides rather than a path allowlist. The
  // declaration names BOTH operator messages, and it is gated on `untouched`, so it covers ARRIVAL
  // and no state the reader produced.
  assert.match(SOURCE, /const arrivalDeclaration = untouched/);
  assert.match(SOURCE, /"data-open-on-mount":/);
  // Spread onto EVERY element that reports itself open on arrival. Two of them: the panel, and the
  // cell whose tint sets `aria-selected`, which is not inside the panel and so is not covered by
  // the panel's own declaration. A missed one is an UNALLOWED open element in the site-wide sweep.
  const spreads = SOURCE.match(/\{\.\.\.\((?:isSelected|headerSelected|selectedDimension) \? arrivalDeclaration : null\)\}/g) ?? [];
  assert.equal(spreads.length, 3, "the panel, the region cell and the row header each declare it");
  assert.match(SOURCE, /2026-09-09 item 5/, "the message that asks for the default");
  assert.match(SOURCE, /no items expanded when first navigtaing to a page/, "the message it excepts");
  // And the citation sits at the site too, so the next reader finds the ruling beside the code.
  // FOLD 65 (2026-09-09): the number is F43, not the lane's F42. Wave 64 renumbered
  // default-open-disclosure to F43 and gave F42 to card-shell-outside-section-card, so this test
  // reads the number the default-open gate actually carries on this tree.
  assert.match(SOURCE, /fitness-allow: F43 \(R6 2026-09-09/);
});

test("THE PANEL SLOT IS UNCONDITIONAL AND FIXED-HEIGHT, which is what makes the card's height constant", () => {
  // REPLACES "the panel renders ONLY from a committed selection, so no selection means no panel".
  // Acceptance criterion A: "at 1440 the matrix card height is constant regardless of selection".
  // A panel that comes and goes cannot satisfy that, and neither can one whose height follows its
  // content, so the slot is always in the DOM, always PANEL_SLOT_HEIGHT tall, and scrolls inside.
  assert.doesNotMatch(SOURCE, /\{selectedDimension && \(\s*\n\s*<div\s*\n\s*id=\{panelId\}/, "the slot is not gated on a selection");
  assert.match(SOURCE, /const PANEL_SLOT_HEIGHT = 300;/);
  assert.match(SOURCE, /height: PANEL_SLOT_HEIGHT,/);
  assert.match(SOURCE, /overflowY: "auto",/);
  // The Esc state renders inside the slot, so the slot is never an empty box with no explanation.
  assert.match(SOURCE, /data-audit="ops-panel-empty"/);
  // The card height can only change if content is rendered outside the slot.
  const card = SOURCE.slice(SOURCE.indexOf('dataAudit="ops-matrix-card"'));
  assert.equal((card.match(/data-audit="ops-matrix-panel"/g) ?? []).length, 1, "one slot, one place");
});

test("the foot legend lives on the CARD, outside the panel's scroller, and says what arrows do", () => {
  const panelBlock = CODE.slice(CODE.indexOf('data-audit="ops-matrix-panel"'), CODE.indexOf('data-audit="ops-matrix-foot"'));
  assert.doesNotMatch(panelBlock, /ops-matrix-foot/, "the foot is not inside the panel block");
  // RE-POINTED 2026-09-09 to the artboard's own foot text, which is also what item 3 restores.
  assert.match(CODE, /arrow keys move the\s+selection/, "the artboard's wording");
  assert.doesNotMatch(CODE, /arrow keys move between cells/, "not the 2026-09-08 wording");
  assert.match(CODE, /click a cell to open its facts/, "the artboard's click affordance");
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

test("a fact with NO figure leads with a six-word headline at 13px/600, then the claim", () => {
  // RE-POINTED 2026-09-09, replacing "the fact card's empty figure slot says 'pending'". The
  // operator's delete list forbids exactly that: "the words CURRENT and PENDING inside cells and
  // inside fact cards". His build list states the replacement: "If the pipeline has no figure for a
  // fact, the card leads with a 6-word headline in 13px/600, then the claim." The branch is proven
  // to RUN by the `ops-matrix-nofigure` mount and spec/operations-matrix-nofigure.json; this test
  // pins its shape in the source.
  assert.match(SOURCE, /const \{ figure, description, prose \} = factHeadline\(f\)/);
  assert.doesNotMatch(CODE, /<Absence reason="pending" \/>/, "the literal PENDING is deleted, not hidden");
  assert.doesNotMatch(CODE, /reason="pending"/, "in any spelling");
  assert.match(SOURCE, /data-audit="ops-fact-headline"/);
  assert.match(SOURCE, /fontSize: 13, fontWeight: 600/);
  assert.match(SOURCE, /\{sixWordHeadline\(description \|\| prose \|\| ""\)\}/);
  // Six words, never padded and never invented: fewer words in, fewer words out.
  assert.match(SOURCE, /export function sixWordHeadline\(text: string, n = 6\)/);
  assert.match(SOURCE, /words\.slice\(0, n\)\.join\(" "\)/);
  const card = SOURCE.slice(SOURCE.indexOf("function MatrixFactCard"), SOURCE.indexOf("// ── Shared cell geometry"));
  assert.equal(
    (card.match(/var\(--font-display\)/g) ?? []).length,
    1,
    "the display face appears exactly once in the card: on the figure",
  );
});

test("the detail sentence is 12.5px / 1.5, and its LINE LENGTH is capped at 72ch", () => {
  assert.match(SOURCE, /data-audit="ops-fact-detail"/);
  assert.match(SOURCE, /lineHeight: 1\.5,/);
  // Operator ruling 2026-09-09: "72ch is the MAX line length of the prose (max-width:72ch on the
  // text block); 560px is the MIN width of the column that holds it." Two constraints on two
  // different boxes, so the cap is a plain 72ch and the `max(560px, ...)` construction is gone; the
  // 560px floor is measured on the column by acceptance leg B, not on the text block.
  assert.match(SOURCE, /maxWidth: "72ch",/);
  assert.doesNotMatch(SOURCE, /maxWidth: "max\(/, "the max(560px, 72ch) construction is gone, not merely commented");
});

test("the claim carries the same 72ch measure as the detail sentence", () => {
  const card = SOURCE.slice(SOURCE.indexOf("function MatrixFactCard"), SOURCE.indexOf("// ── Shared cell geometry"));
  const quote = card.slice(card.indexOf('data-audit="ops-fact-quote"'));
  assert.match(quote.slice(0, 700), /maxWidth: "72ch",/, "the claim is prose and carries the prose measure");
});

test("the source line is source name, then period, then provenance or the row's written date", () => {
  // The operator's shape, 2026-09-09: "Vervo Logistics · 2024-08 · row written 2026-05-28", and the
  // artboard's: "MOM Occupational Wage Survey · 2025 · official". The build before this one put the
  // written date second and the provenance word third, which is neither.
  assert.match(SOURCE, /const period = \(f\.referencePeriod as string\) \|\| \(f\.asAtDate \? String\(f\.asAtDate\)\.slice\(0, 7\) : null\)/);
  assert.match(SOURCE, /\{period \? ` · \$\{period\}` : ""\}/);
  assert.match(SOURCE, /\{provenance \? ` · \$\{provenance\}` : written \? ` · row written \$\{written\}` : " · no date on row"\}/);
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
  // "STACKED VERTICALLY, never side by side" (operator, 2026-09-09). Asserted here as the flex
  // direction and proven by GEOMETRY in ops-matrix-acceptance-smoke.mjs leg A, which reads the
  // cards' client rects and fails if any card's top is above its predecessor's bottom.
  assert.match(SOURCE, /flexDirection: "column"/);
  assert.match(SOURCE, /data-audit="ops-compare-label"/);
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
  // RE-POINTED 2026-09-09 to the artboard's own head aside, "18 OF 30 CELLS SOURCED · 60% · 18
  // REGIONS · SCROLL →": the region count is always drawn (and it is the UNSCOPED roster, which is
  // what the artboard shows beside a five-column table), and only the `scroll →` half is
  // conditional. The operator's delete list gives the string as "N regions · scroll →"; the artboard
  // keeps the two computed figures in front of it, and the artboard wins.
  assert.match(SOURCE, /\{totalRegions\} regions\{scrolls \? " · scroll →" : ""\}/);
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
  // RE-POINTED 2026-09-09. The 700px ceiling was arithmetic with no measurement behind it, and it
  // let SIX columns fit too, which is why "regions beyond five scroll inside the card" was false on
  // this base. MEASURED scroller widths in chromium: 1024px on the composed /operations page at
  // 1440, 892px in the component mount. The invariant is a WINDOW, not a ceiling: five columns fit
  // the narrower of the two, and six exceed the wider.
  assert.ok(dim + 5 * region <= 892, `five region columns plus the dimension column FIT the narrowest measured scroller, 892px (got ${dim + 5 * region})`);
  assert.ok(dim + 6 * region > 1024, `a sixth region column EXCEEDS the widest measured scroller, 1024px, so it scrolls (got ${dim + 6 * region})`);
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
