// Structural test for src/components/detail/FactBlocks.tsx. No JSX render harness exists in this
// repo (DetailShell.npmtest.mjs's own header names the same constraint) — this reads the component's
// source text to guard the contract points the dispatch binds: one shared FACT/ANALYSIS/LEGAL ->
// FactCard mapping, applied via the already-shared parser, and (lane uidetails2, 2026-09-07) every
// non-claim "prose" block routed through the shared GfmSection renderer rather than a plain <p> — so
// a GFM table embedded in a section (e.g. the operations port-dues concession table) renders as a
// real table, not a paragraph of pipe characters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "FactBlocks.tsx"),
  "utf8"
);

test("parses content_md via the one shared fact-paragraphs parser, never a page-local reimplementation", () => {
  assert.match(SOURCE, /from "@\/lib\/detail\/fact-paragraphs"/);
  assert.match(SOURCE, /parseFactParagraphs\(markdown\)/);
});

test("a prose block renders via the shared GfmSection (table/list-capable), not a plain <p>", () => {
  assert.match(SOURCE, /from "@\/components\/shared\/GfmSection"/);
  assert.match(SOURCE, /b\.kind === "prose"/);
  assert.match(SOURCE, /<GfmSection key=\{i\} markdown=\{b\.text\} \/>/);
  assert.doesNotMatch(SOURCE, /<p style=/); // no page-local prose <p> styling reintroduced
});

test("every non-prose block renders through the one shared FactCard, with variant/source/label mapped from the parsed kind", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/FactCard"/);
  assert.match(SOURCE, /<FactCard/);
  assert.match(SOURCE, /variant=\{b\.kind === "fact" \? "sourced" : b\.kind\}/);
});

test("an empty/unparseable section renders nothing (honest omission), never an empty card shell", () => {
  assert.match(SOURCE, /if \(blocks\.length === 0\) return null;/);
});
