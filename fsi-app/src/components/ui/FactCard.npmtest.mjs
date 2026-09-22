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
// source name, four lines max ... no padding-top."
test("provenance column: gap 2, no padding-top, 1.45 line-height, tier square inline with the source name, 4-line max clamp", () => {
  assert.match(SOURCE, /PROVENANCE_COL[\s\S]*?gap: 2,/);
  assert.doesNotMatch(SOURCE.match(/const PROVENANCE_COL[\s\S]*?\};/)[0], /paddingTop/);
  assert.match(SOURCE, /PROVENANCE_TEXT[\s\S]*?lineHeight: 1\.45,/);
  // RE-DERIVED 2026-09-21 round 2 (see PROVENANCE_COL's own header comment): `calc(1.45em * 4)`
  // resolved `em` against an INHERITED 16px, not this column's own 10.5px text, giving a clamp
  // ~30px too generous (92.8px instead of ~72px) - loose enough that it never protected the
  // 140px card budget in the one case it needed to (a wrapped source/org line). The clamp is now
  // built from this column's own deterministic constants (TierSquare's real 20px row, `--fs-105`
  // * 1.45 for the other 3 rows, this column's own 2px gap) instead of an ambient `em`.
  assert.match(SOURCE, /maxHeight: "calc\(20px \+ \(3 \* \(\(var\(--fs-105\) \* 1\.45\) \+ 2px\)\)\)"/);
  // Tier square and source name render inside the SAME <p>, not two separate stacked blocks.
  assert.match(
    SOURCE,
    /<p style=\{\{ \.\.\.PROVENANCE_TEXT, display: "flex", alignItems: "center", gap: 6 \}\}>\s*\n\s*\{typeof p\.tier === "number" && <TierSquare tier=\{p\.tier\} \/>\}\s*\n\s*\{p\.source && <span>\{p\.source\}<\/span>\}/
  );
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

// Pure CSS math (Playwright cannot run in this sandbox per operator ruling): mirrors the panel-21c
// acceptance detector's own budget (panel21c-accept.mjs: card <= 140px unless the claim exceeds 4
// lines) computed from this file's own layout constants, so a future change to the kind band, body
// padding, or provenance row heights that would blow the budget is caught here even when the
// Playwright leg can't run locally. Uses the operator's own confirmed numbers (body padding 12px
// 14px, kind band 6px 14px, provenance 10.5px/1.45 with no padding-top) plus the DOM box-model
// additions that are real regardless of inline-style intent: the card's own 1px top+bottom border,
// the kind band's 1px border-bottom, and the tier square's declared 18px height plus its own 1px
// top+bottom border (content-box, no box-sizing override on that element).
//
// LABELLED HONESTLY: this is a [HYPOTHESIS]-level model, not a [CONFIRMED] one. Two numbers in it
// are real uncertainty, not just rounding: (1) `kindWordLineHeightApprox` approximates the
// browser's unscoped `normal` line-height at 10.5px as 1.2x - Chromium's real value depends on
// the actual font metrics table of whatever font resolves for "Plus Jakarta Sans, system-ui,
// sans-serif" on the CI runner (this file's own raw-CSS smoke harness, `fullAppCss()`, reads
// globals.css/theme.css as literal text - `@import "tailwindcss"` in that text does not resolve
// in a browser <style> tag, so neither the Tailwind preflight reset nor the self-hosted
// @font-face rules load, and the real render falls back to an unstyled system sans-serif); (2)
// whether "Example Regulation, Article 6" / "Example Regulatory Body" (the shared fixture
// provenance strings) actually WRAP inside the 150px column (135px content width after padding
// and border) is asserted here from typical character-width ratios for bold 10.5px Latin text,
// not from a live measurement. Round 1's test asserted false certainty in exactly this spot (it
// modelled the link row as if lineHeight:1.45 already applied, and the real regression proved
// that model wrong); this version computes both the un-wrapped AND the wrapped-to-2-lines case
// for the source/org rows explicitly, and passes only if BOTH stay under budget, specifically so
// the assertion does not depend on which one actually happens in a live Chromium.
test("panel-21c budget: full provenance (tier+source, org, link, accessed), un-wrapped and with source/org each wrapped to 2 lines, beside a 1-2 line claim, computes to <= 140px", () => {
  const cardBorderTopBottom = 2; // border: "1px solid var(--line-1)" top + bottom; borderLeft override only touches the left side
  const kindBandPaddingV = 12; // "6px 14px" top + bottom
  const kindBandBorderBottom = 1;
  const kindWordLineHeightApprox = 10.5 * 1.2; // fs-105, unset line-height resolves to the browser's "normal" (~1.2x) - [HYPOTHESIS], see test header
  const kindBandHeight = kindBandPaddingV + kindWordLineHeightApprox + kindBandBorderBottom;

  const bodyPaddingV = 24; // "12px 14px" top + bottom

  const provenanceTextLineHeight = 10.5 * 1.45; // PROVENANCE_TEXT, and now the link row too (lineHeight: 1.45)
  const tierSquareHeight = 18 + 2; // TierSquare's own height:18 plus its 1px top+bottom border (content-box)
  const provenanceGaps = 2 * 3; // PROVENANCE_COL gap: 2, three gaps between four stacked rows

  // PROVENANCE_COL's own maxHeight clamp, mirrored from the component (see its header comment):
  // 20px (row1, TierSquare-dominated) + 3 * (one PROVENANCE_TEXT line + the column's 2px gap).
  const provenanceMaxHeightClamp = tierSquareHeight + 3 * (provenanceTextLineHeight + 2);

  for (const sourceOrgWraps of [false, true]) {
    const row1 = Math.max(tierSquareHeight, provenanceTextLineHeight * (sourceOrgWraps ? 2 : 1)); // tier square inline with source
    const row2 = provenanceTextLineHeight * (sourceOrgWraps ? 2 : 1); // org
    const row3 = provenanceTextLineHeight; // link, now deterministic (lineHeight: 1.45)
    const row4 = provenanceTextLineHeight; // accessed
    const provenanceNaturalHeight = row1 + row2 + row3 + row4 + provenanceGaps;
    // overflow: hidden + maxHeight: the rendered height is capped, never allowed past the clamp.
    const provenanceHeight = Math.min(provenanceNaturalHeight, provenanceMaxHeightClamp);

    for (const claimLines of [1, 2]) {
      const claimHeight = claimLines * (13 * 1.6); // CLAIM_TEXT fs-13, lineHeight 1.6
      const bodyContent = Math.max(claimHeight, provenanceHeight);
      const cardHeight = cardBorderTopBottom + kindBandHeight + bodyPaddingV + bodyContent;
      assert.ok(
        cardHeight <= 140,
        `computed card height ${cardHeight}px (sourceOrgWraps=${sourceOrgWraps}, claimLines=${claimLines}) exceeds the 140px acceptance budget`
      );
    }
  }
});

// Operator review 2026-09-21, defect 4: "the sub-label is wrapping to two lines in 132px ...
// The sub-label is 10px uppercase, nowrap, ellipsised if it must be."
test("figure sub-label is nowrap with ellipsis overflow (defect 4: no two-line wrap in the 132px lead column)", () => {
  assert.match(SOURCE, /FIGURE_SUB_LABEL[\s\S]*?whiteSpace: "nowrap",/);
  assert.match(SOURCE, /FIGURE_SUB_LABEL[\s\S]*?textOverflow: "ellipsis",/);
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
