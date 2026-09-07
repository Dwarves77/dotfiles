// Structural + behavioral test for src/components/detail/SourcesGrid.tsx (lane uidetails2,
// 2026-09-07). Extracted from RegulationDetailSurface's page-local sourceEntriesOf/SourcesGrid pair
// so market/research/operations don't each carry a third copy (CLAUDE.md rule 13, no duplication).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "SourcesGrid.tsx"),
  "utf8"
);

test("exports sourceEntriesOf and SourcesGrid as shared, reusable parts", () => {
  assert.match(SOURCE, /export function sourceEntriesOf/);
  assert.match(SOURCE, /export function SourcesGrid/);
});

test("parses the fullBrief '## Sources' block via the shared extractor, never a page-local regex", () => {
  assert.match(SOURCE, /from "@\/lib\/agent\/extract-regulation-sections"/);
  assert.match(SOURCE, /extractRegulationSections\(r\.fullBrief\)/);
});

test("falls back to a single synthetic row from the item's own url/sourceName/sourceTier fields, never fabricates a source", () => {
  const fn = SOURCE.slice(SOURCE.indexOf("export function sourceEntriesOf"), SOURCE.indexOf("export function SourcesGrid"));
  assert.match(fn, /r\.url\s*\n?\s*\?\s*\[\{ tier:/);
  assert.match(fn, /:\s*\[\]/); // empty array, never a placeholder row, when there is no url either
});

test("tier is clamped to the customer-facing 1-7 range (DO-NOT-REVERT)", () => {
  assert.match(SOURCE, /function clampTier/);
  assert.match(SOURCE, /Math\.min\(7, Math\.max\(1, Math\.round\(n\)\)\)/);
});

test("each row is one 44px-minimum click target, and the whole row (not just a sub-element) is the link when a url is present", () => {
  assert.match(SOURCE, /minHeight: 44/);
  assert.match(SOURCE, /s\.url \? \(\s*<a key=\{i\} href=\{s\.url\}/);
});
