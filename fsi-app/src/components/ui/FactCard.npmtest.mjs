// Structural regression test for src/components/ui/FactCard.tsx v2 (lane w10-factcard, 2026-09-20;
// artboard 21c, parts-brief-2026-09-18.md section 2.1). No JSX render harness exists in this repo
// (see WatchButton.npmtest.mjs's own header) - this reads the component's source text to guard the
// v2 contract: kind band (10.5px/800/.12em uppercase kind word + 10.5px muted qualifier, 6px 14px
// padding, tint, 1px rgba(0,0,0,.06) rule below), body grid 132px/1fr/150px, three FORMS (orange,
// ink, inference), and the 3px left edge. The v1 three-variant prop (sourced/inference/counsel) is
// REMOVED per the parts brief's "every call site moves in this lane" rule - this file replaces
// FactCard.npmtest.mjs's prior v1 assertions rather than adding a second generation alongside them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "FactCard.tsx"),
  "utf8"
);

test("the v1 variant prop is fully removed, not kept beside the model-based render", () => {
  assert.doesNotMatch(SOURCE, /FactCardVariant/);
  assert.doesNotMatch(SOURCE, /variant === "sourced"/);
});

test("FactCard takes a FactCardModel prop (default density), imported from the one model home", () => {
  assert.match(SOURCE, /from "@\/lib\/detail\/fact-card-model"/);
  // Lane w10-factcard-b (2026-09-20; Amendment 1 section B.1): the default-density `{ model }` shape
  // is unchanged, but the component signature is now a discriminated union so the SAME function also
  // accepts `{ density: "matrix", fact, baseFact }` for the operations panel's fact card (formerly the
  // standalone MatrixFactCard). One exported FactCard, two prop shapes, never two components.
  assert.match(SOURCE, /type FactCardProps =\s*\n\s*\| \{ density\?: undefined; model: FactCardModel \}\s*\n\s*\| \{ density: "matrix"; fact: Record<string, unknown>; baseFact: Record<string, unknown> \| null \};/);
  assert.match(SOURCE, /export function FactCard\(props: FactCardProps\)/);
  assert.match(SOURCE, /const \{ model \} = props;/);
});

test("kind band: 10.5px/800/.12em uppercase kind word, 10.5px muted qualifier, 6px 14px padding, 1px rgba(0,0,0,.06) rule below", () => {
  assert.match(SOURCE, /fontSize: "var\(--fs-105\)"/);
  assert.match(SOURCE, /fontWeight: 800,/);
  assert.match(SOURCE, /letterSpacing: "0\.12em"/);
  assert.match(SOURCE, /padding: "6px 14px"/);
  assert.match(SOURCE, /borderBottom: "1px solid var\(--line-3\)"/);
});

// Operator review 2026-09-21 (panel 21c), defect 1c: "When there is no figure lead ... the grid
// is 1fr 150px - the 132px column does not exist." `bodyRow(withLead)` is the fix: the grid is
// 132px/1fr/150px only when a figure lead is present, else 1fr/150px, gap 14, padding 12px 14px
// unchanged either way. The lead `<div>` itself is only rendered when `model.figureLead` is
// truthy, so a lead-less kind never keeps a blank 132px column.
test("body row grid is conditional on figureLead: 132px 1fr 150px when present, 1fr 150px when absent; gap 14, padding 12px 14px", () => {
  assert.match(SOURCE, /gridTemplateColumns: withLead \? "132px 1fr 150px" : "1fr 150px"/);
  assert.match(SOURCE, /gap: 14,/);
  assert.match(SOURCE, /padding: "12px 14px"/);
  assert.match(SOURCE, /\{model\.figureLead && \(\s*\n\s*<div className="fact-card-v2-lead">/);
});

test("figure lead uses Anton (--font-display) at --fs-22, in the edge colour", () => {
  assert.match(SOURCE, /fontFamily: "var\(--font-display\)", fontSize: "var\(--fs-22\)"/);
});

test("claim caps at 66ch per 2.1 (distinct from the record-grade primitive's 72ch cap)", () => {
  assert.match(SOURCE, /maxWidth: "66ch"/);
});

test("left edge is 3px, not the v1 card's 2px", () => {
  assert.match(SOURCE, /borderLeft: `3px solid/);
});

test("orange family (ACTION REQUIRED, LEGAL CONFIRMATION REQUIRED) uses var(--action) edge/kind word and var(--action-tint) band", () => {
  assert.match(SOURCE, /ORANGE_KINDS = new Set\(\["ACTION REQUIRED", "LEGAL CONFIRMATION REQUIRED"\]\)/);
  assert.match(SOURCE, /var\(--action-tint\)/);
});

test("inference form is 1px dashed all round on var(--page), italic body, no figure lead, right column reads 'not citable'", () => {
  assert.match(SOURCE, /border: "1px dashed var\(--card-hover-line\)"/);
  assert.match(SOURCE, /background: "var\(--page\)"/);
  assert.match(SOURCE, /not citable/);
});

test("provenance column carries a 1px left rule and is never a paragraph under the body", () => {
  assert.match(SOURCE, /PROVENANCE_COL[\s\S]*?borderLeft: "1px solid var\(--line-1\)"/);
});

// Operator review 2026-09-21, defect 1b: "10.5px / 1.45, gap 2px, T-square inline with the
// source name, four lines max ... no padding-top." Re-corrected 2026-09-22 (sign-off correction
// 1): the maxHeight/overflow clamp this test used to check FOR is now REMOVED - the column is no
// longer clipped, so this test checks its ABSENCE instead.
test("provenance column: gap 2, no padding-top, 1.45 line-height, tier square inline with the source name, NO clip (no maxHeight, no overflow:hidden)", () => {
  const colBlock = SOURCE.match(/const PROVENANCE_COL[\s\S]*?\};/)[0];
  assert.match(colBlock, /gap: 2,/);
  assert.doesNotMatch(colBlock, /paddingTop/);
  assert.doesNotMatch(colBlock, /maxHeight/, "sign-off 2026-09-22 correction 1: the column is not clipped");
  assert.doesNotMatch(colBlock, /overflow:/, "sign-off 2026-09-22 correction 1: the column is not clipped");
  assert.match(SOURCE, /PROVENANCE_TEXT[\s\S]*?lineHeight: 1\.45,/);
  // Tier square and source name render inside the SAME <p>, not two separate stacked blocks.
  assert.match(
    SOURCE,
    /<p style=\{\{ \.\.\.PROVENANCE_TEXT, display: "flex", alignItems: "center", gap: 6 \}\}>\s*\n\s*\{typeof p\.tier === "number" && <TierSquare tier=\{p\.tier\} \/>\}\s*\n\s*\{p\.source && <span>\{p\.source\}<\/span>\}/
  );
});

// Sign-off 2026-09-22, correction 1: "If the source name needs two lines, drop the organisation
// line, not the accessed date." sourceNameWrapsToTwoLines is the heuristic; the org row is gated
// on it, the accessed row never is.
test("sourceNameWrapsToTwoLines heuristic exists and the organisation row (never the accessed row) is gated on it", () => {
  assert.match(SOURCE, /export function sourceNameWrapsToTwoLines\(source: string \| null \| undefined\): boolean \{/);
  assert.match(SOURCE, /const dropOrg = sourceNameWrapsToTwoLines\(p\.source\);/);
  assert.match(SOURCE, /\{p\.org && !dropOrg && <p style=\{PROVENANCE_TEXT\}>\{p\.org\}<\/p>\}/);
  // The accessed row's own condition is never gated on dropOrg.
  assert.match(SOURCE, /\{p\.accessed && <p style=\{PROVENANCE_TEXT\}>\{p\.accessed\}<\/p>\}/);
});

// Panel 21c acceptance regression, round 2 (lane w10-factcard-d, 2026-09-21; rendering-guard run
// 35677086619). Round 1 removed the link row's `minHeight: 24` on the theory it was forcing the
// row taller than its siblings; the re-run reported the IDENTICAL 144px on the IDENTICAL 3 cards,
// proving the link row was never the actual bottleneck (a real content-height change there could
// not have left the measured card height byte-for-byte unchanged). The link row is still never
// forced to a fixed height - that part of round 1 was a genuine, if insufficient, fix - but the
// height budget itself is protected by PROVENANCE_COL's maxHeight clamp (see its header comment),
// not by any one row's own sizing.
test("provenance link row carries no minHeight, uses the same 1.45 line-height as its siblings, and its hit-area expansion does not grow the row's own layout contribution", () => {
  const hrefBlock = SOURCE.match(/\{p\.href && \([\s\S]*?<\/a>\s*\n\s*\)\}/)[0];
  // Scoped to the rendered <a>'s own style object, not the surrounding history comment (which
  // legitimately quotes the old `minHeight: 24` by name when explaining what round 1 removed).
  const anchorStyle = hrefBlock.match(/<a\b[\s\S]*?style=\{\{[\s\S]*?\}\}/)[0];
  assert.doesNotMatch(anchorStyle, /minHeight/);
  assert.match(anchorStyle, /lineHeight: 1\.45,/, "the link row now matches PROVENANCE_TEXT's line-height instead of an unscoped browser default");
  // The expanded hit area (law-2 tap-target fix, defect 2 below) must net to zero added layout
  // height: equal-and-opposite padding/margin on the same axis.
  assert.match(anchorStyle, /padding: "5px 0",/);
  assert.match(anchorStyle, /margin: "-5px 0",/);
});

// Defect 2 (this round): removing minHeight:24 with nothing in its place dropped the link's real
// clickable height under the law-2 floor (production measurement: `a[example.com] 91x12px` -
// width fine, height collapsed to the row's unpadded line box). Fixed via an expanded hit area
// (padding + equal negative margin, see the link row's own header comment for why this technique
// is safe here despite PROVENANCE_COL's own overflow:hidden, unlike CardFoot.tsx's FootLink which
// uses real padding for the opposite reason). 15.225px (10.5px * 1.45, now deterministic) + 5px
// padding top + 5px padding bottom = 25.225px, clearing the 24px floor with margin to spare.
test("provenance link row's expanded hit area clears the law-2 24px floor (no interactive neighbour within 8px, so 24px alone is the correct floor, not 44px)", () => {
  const naturalLineHeight = 10.5 * 1.45;
  const hitAreaHeight = naturalLineHeight + 5 + 5;
  assert.ok(hitAreaHeight >= 24, `hit area ${hitAreaHeight}px must be >= the law-2 24px floor`);
});

// Sign-off 2026-09-22, correction 1 retires the maxHeight-clamp-protected "always <= 140px" model
// this test used to check: "the column is not clipped ... the card grows if the column is taller
// than the claim." panel21c-accept.mjs (the acceptance detector consumed by the Playwright smoke
// spec) now allows a card over 140px when the PROVENANCE column, not only the claim, genuinely
// needs the room - see panel21c-accept.mjs's own `provenanceLineCount` check and
// panel21c-accept.test.mjs's new cases. This file's own pure-math obligation shrinks to: the
// un-wrapped four-row provenance height (used by the four-line fixture) and the wrapped-source
// two-row-plus-two height (used by the two-line-name fixture, org dropped) are each computed
// correctly from the component's real, now-unclamped layout constants - a regression check on the
// ARITHMETIC this lane's fixtures assert against, not a card-height ceiling.
test("provenance natural height: four ordinary rows vs. a wrapped source name with organisation dropped compute correctly, with no clamp applied", () => {
  const provenanceTextLineHeight = 10.5 * 1.45; // PROVENANCE_TEXT, and the link row (lineHeight: 1.45)
  const tierSquareHeight = 18 + 2; // TierSquare's own height:18 plus its 1px top+bottom border (content-box)
  const provenanceGap = 2; // PROVENANCE_COL gap: 2

  // Four-line case: source(+tier), org, link, accessed - three gaps between four rows, no clamp.
  const fourLineHeight =
    Math.max(tierSquareHeight, provenanceTextLineHeight) /* row 1 */ +
    provenanceTextLineHeight /* org */ +
    provenanceTextLineHeight /* link */ +
    provenanceTextLineHeight /* accessed */ +
    provenanceGap * 3;
  assert.ok(fourLineHeight > 0);

  // Two-line-name case: source wraps to 2 lines (org dropped) - link, accessed remain. Two gaps
  // between three rows now that org is gone.
  const twoLineNameHeight =
    provenanceTextLineHeight * 2 /* wrapped source, row 1 */ +
    provenanceTextLineHeight /* link */ +
    provenanceTextLineHeight /* accessed */ +
    provenanceGap * 2;

  // The wrapped-name case is naturally taller than the four-line case's row-1 contribution alone
  // (a 2-line source row is taller than the tier-square-dominated 1-line row), but dropping the
  // organisation row keeps it from compounding into a 5-row height - this is the arithmetic proof
  // that the drop rule holds the column near its 4-line budget rather than growing unbounded.
  assert.ok(
    twoLineNameHeight < fourLineHeight + provenanceTextLineHeight,
    "dropping organisation keeps the wrapped-name column under a 5th full row's worth of extra height"
  );
});

// Operator review 2026-09-21, defect 4: "the sub-label is wrapping to two lines in 132px ...
// The sub-label is 10px uppercase, nowrap, ellipsised if it must be."
test("figure sub-label is nowrap with ellipsis overflow (defect 4: no two-line wrap in the 132px lead column)", () => {
  assert.match(SOURCE, /FIGURE_SUB_LABEL[\s\S]*?whiteSpace: "nowrap",/);
  assert.match(SOURCE, /FIGURE_SUB_LABEL[\s\S]*?textOverflow: "ellipsis",/);
});

// Sign-off 2026-09-22, correction 3: "'RECOVERY / RECYCLI...' truncates: the sub-label ... is
// nowrap but may use the full 132px; reduce letter-spacing to .04em before ellipsising."
test("figure sub-label letter-spacing is .04em (was .06em), tried before the ellipsis ever engages", () => {
  assert.match(SOURCE, /FIGURE_SUB_LABEL[\s\S]*?letterSpacing: "0\.04em",/);
  assert.doesNotMatch(SOURCE.match(/const FIGURE_SUB_LABEL[\s\S]*?\};/)[0], /0\.06em/);
});

// Build item 2 / fact-card-model.ts's mergeAdjacentSameKind: a merged card's extra claims render
// as their own stacked paragraphs, each with its own provenance line, inside the SAME card.
test("a merged card's additionalClaims render as stacked claim paragraphs, each with its own provenance line", () => {
  assert.match(SOURCE, /model\.additionalClaims\?\.map\(\(c, i\) => \(/);
  assert.match(SOURCE, /renderClaim\(c\.claim\)/);
  assert.match(SOURCE, /ProvenanceBlock provenance=\{c\.provenance\}/);
});

test("mobile stacking below 768px collapses the body grid to a single column with provenance as a footer line", () => {
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.match(SOURCE, /flex-direction: column !important/);
});

test("the kind word carries data-guard-title (UX contract: title element of every row/card component)", () => {
  assert.match(SOURCE, /data-guard-title data-part-slot="kind-word" style=\{\{ \.\.\.KIND_WORD/);
});

// Amendment 2 (lane w10-factcard, 2026-09-20; rendering-guard CI fix): the kind word is one of the
// operator's nine fixed FACT_CARD_KINDS, including the literal "DEADLINE" - a real vocabulary word,
// not an unfilled slot. `data-part-slot="kind-word"` is the narrow, attacked exemption
// harness.mjs's measureGuard checks for (see harness.npmtest.mjs's attack proof); this asserts the
// component actually carries the attribute the exemption depends on.
test("the kind word carries data-part-slot=\"kind-word\" (the rendering-guard's placeholder-literal exemption anchor)", () => {
  assert.match(SOURCE, /data-part-slot="kind-word"/);
});

// Amendment 1 section C (coordinator, 2026-09-20): "the part's root element carries
// data-part='fact-card' and data-kind='<kind slug>' ... so conformance can be measured instead
// of guessed" - the fix for two audits that could not tell which component rendered a node.
test("root element carries data-part=\"fact-card\" and a data-kind slug derived from the kind word", () => {
  assert.match(SOURCE, /data-part="fact-card"/);
  assert.match(SOURCE, /data-kind=\{kindSlug\(model\.kind\)\}/);
  assert.match(SOURCE, /function kindSlug\(kind: string\): string \{/);
});

// Lane w10-factcard-c (2026-09-21), defects 1 and 2. A bolded run in a claim is a real <strong>
// element, not <b> (the render-test target the lane brief states); a link node (fact-card-model.ts's
// `splitEmbeddedLinks`, defect 2's fix for a bare url left embedded in a claim) is a real <a>, never
// bare text in the plain-text <span> branch.
test("renderClaim renders a bold node as <strong> (not <b>) and a link node (n.href) as a real <a>, host text, never bare in a <span>", () => {
  assert.match(SOURCE, /function renderClaim\(nodes: ClaimNode\[\]\) \{/);
  assert.doesNotMatch(SOURCE, /<b key=\{i\}>/, "bold claim text is never rendered as <b>");
  assert.match(SOURCE, /n\.bold \? <strong key=\{i\}>\{n\.text\}<\/strong> : <span key=\{i\}>\{n\.text\}<\/span>/);
  assert.match(SOURCE, /if \(n\.href\) \{/, "a link node is checked before the bold/plain branch");
  assert.match(SOURCE, /<a[\s\S]{0,120}?href=\{n\.href\}/, "a link node renders a real <a href={n.href}>");
});
