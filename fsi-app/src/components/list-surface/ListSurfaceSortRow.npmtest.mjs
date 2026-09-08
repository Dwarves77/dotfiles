// Structural regression test for ListSurfaceSortRow.tsx (artboards 02/id="p2", 04/id="p4": count +
// "grouped by band · Show as one list" left, "Sort ..." segmented control right). Text-level, same
// convention as ListSurfaceShell.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "ListSurfaceSortRow.tsx"), "utf8");

test("renders the flat-toggle link and the labelled segmented option row", () => {
  assert.match(SOURCE, /onClick=\{onToggleFlat\}/);
  assert.match(SOURCE, /\{flatToggleLabel\}/);
  assert.match(SOURCE, /\{controlLabel\}/);
  assert.match(SOURCE, /onClick=\{\(\) => onSelect\(opt\.key\)\}/);
});

test("active option is visually distinguished (filled) from inactive options", () => {
  assert.match(SOURCE, /isActive \? "var\(--brand\)" : "transparent"/);
  assert.match(SOURCE, /isActive \? "#fff" : "var\(--ink-2\)"/);
});
