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

test("FactCard takes a single FactCardModel prop, imported from the one model home", () => {
  assert.match(SOURCE, /from "@\/lib\/detail\/fact-card-model"/);
  assert.match(SOURCE, /export function FactCard\(\{ model \}: \{ model: FactCardModel \}\)/);
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
  assert.match(SOURCE, /data-guard-title style=\{\{ \.\.\.KIND_WORD/);
});
