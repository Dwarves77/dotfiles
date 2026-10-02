// Structural regression test for EudrCustodyPanelView.tsx's combined-empty shortcut, absence rule
// (2026-09-25 close): "a value that exists is shown; one that cannot exist yet names the data it
// needs". The shortcut used when BOTH tables are empty used to render one generic "No rows yet,
// source: none" line, discarding the two specific per-table gap constants (EUDR_PLOT_GAP,
// CUSTODY_GAP) already used by the per-table branches when only one table is empty. This lane
// (W2-C, 2026-09-29) makes the combined branch render both specific lines instead. Source-text
// regression, same convention as StateNote.npmtest.mjs's own header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "EudrCustodyPanelView.tsx"),
  "utf8"
);

test("the two specific gap-line constants are defined and each names its own data requirement", () => {
  assert.match(SOURCE, /EUDR_PLOT_GAP = "EUDR plot claims: no rows yet.*TRACES filings are per-consignment/);
  assert.match(SOURCE, /CUSTODY_GAP = "Custody chains: no rows yet.*certificate registries have no bulk \$0 feed confirmed/);
});

test("the combined-empty shortcut renders both specific gap lines, not the old generic one", () => {
  // The old generic line read "... source: none (scripts/spec09/SOURCES.md)." immediately after
  // the panel title, with no per-table specifics; that exact fragment must not remain.
  assert.doesNotMatch(SOURCE, /source: none \(scripts\/spec09\/SOURCES\.md\)\.\s*<\/p>\s*\);/);
  const start = SOURCE.indexOf("if (plotClaims.length === 0 && custodyChains.length === 0)");
  const end = SOURCE.indexOf(");", SOURCE.indexOf("return (", start));
  const block = SOURCE.slice(start, end);
  assert.match(block, /\{EUDR_PLOT_GAP\}/);
  assert.match(block, /\{CUSTODY_GAP\}/);
});
