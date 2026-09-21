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

test("body row is a 132px 1fr 150px grid, gap 14, padding 12px 14px", () => {
  assert.match(SOURCE, /gridTemplateColumns: "132px 1fr 150px"/);
  assert.match(SOURCE, /gap: 14,/);
  assert.match(SOURCE, /padding: "12px 14px"/);
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
